-- 087_design_build_agreement.sql (ADDITIVE, safe to run twice)
--
-- The second stage contract (Peter, 15 Nov 2026): the Design / Build
-- Agreement, made on the deal when it reaches the Design Build Agreement
-- stage, the same way the Feasibility Agreement is.
--
-- What differs from the feasibility one:
--   - The client pays the RETAINER on the link ($3,000 by default), not the
--     design fee; the fee is billed every two weeks against the retainer.
--     due_amount holds what the link asks for (null = the lines' total).
--   - The contract fills in more: the building department, the interior
--     designer, the two hourly rates, how long the offer is valid, and the
--     client's mailing address, phone and email. Those live in details.

-- 1. The new kind, what is due on the link, and the contract details.
alter table public.agreements drop constraint if exists agreements_kind_check;
alter table public.agreements add constraint agreements_kind_check check (kind in ('feasibility', 'design_build'));
alter table public.agreements
  add column if not exists due_amount numeric check (due_amount is null or due_amount >= 0),
  add column if not exists details jsonb not null default '{}'::jsonb;
comment on column public.agreements.due_amount is 'What the client pays on the link (design build: the retainer). Null = the line items total.';
comment on column public.agreements.details is 'Contract fill-ins by kind (design build: jurisdiction, interior_designer, ca_hourly, revision_hourly, valid_days, mailing_address, client_phone, client_email).';

-- 2. Make a stage agreement for a deal, filled from its contacts, property and
--    current scope of work. One live agreement per kind per deal.
create or replace function public.ensure_stage_agreement(p_deal_id uuid, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_c1 uuid; v_c2 uuid; v_loc uuid;
  v_names text; v_addr text; v_city text; v_details text; v_scope text;
  v_phone text; v_email text;
begin
  if p_kind not in ('feasibility', 'design_build') then raise exception 'Unknown agreement kind %', p_kind; end if;
  select id into v_id from agreements
    where deal_id = p_deal_id and kind = p_kind and status <> 'void' limit 1;
  if v_id is not null then return v_id; end if;

  with linked as (
    select case when from_type = 'contact' then from_id else to_id end as cid, created_at
      from associations
     where (from_type = 'deal' and from_id = p_deal_id and to_type = 'contact')
        or (to_type = 'deal' and to_id = p_deal_id and from_type = 'contact')
  ), ordered as (
    select cid, row_number() over (order by min(created_at)) rn from linked group by cid
  )
  select max(cid::text) filter (where rn = 1)::uuid, max(cid::text) filter (where rn = 2)::uuid
    into v_c1, v_c2 from ordered;

  select case when from_type = 'location' then from_id else to_id end into v_loc
    from associations
   where (from_type = 'deal' and from_id = p_deal_id and to_type = 'location')
      or (to_type = 'deal' and to_id = p_deal_id and from_type = 'location')
   order by created_at limit 1;

  select string_agg(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ' and ' order by array_position(array[v_c1, v_c2], id))
    into v_names from contacts where id in (v_c1, v_c2);
  select phone, email into v_phone, v_email from contacts where id = v_c1;
  select nullif(concat_ws(', ', nullif(address, ''), nullif(city, ''), nullif(trim(concat_ws(' ', nullif(state, ''), nullif(postcode, ''))), '')), ''),
         nullif(trim(city), '')
    into v_addr, v_city from locations where id = v_loc;
  select payment_details into v_details from agreements
    where payment_details is not null order by created_at desc limit 1;
  select body into v_scope from deal_scopes where deal_id = p_deal_id order by version desc limit 1;

  insert into agreements (deal_id, kind, contact_id, second_contact_id, location_id, client_names, property_address,
                          payment_details, client2_required, scope_of_work, due_amount, details)
    values (p_deal_id, p_kind, v_c1, v_c2, v_loc, nullif(v_names, ''), v_addr, v_details, v_c2 is not null, v_scope,
            case when p_kind = 'design_build' then 3000 end,
            case when p_kind = 'design_build' then jsonb_strip_nulls(jsonb_build_object(
              'jurisdiction', case when v_city is not null then 'City of ' || v_city end,
              'interior_designer', 'Patricia McIntosh',
              'ca_hourly', 150, 'revision_hourly', 250, 'valid_days', 30,
              'mailing_address', v_addr, 'client_phone', v_phone, 'client_email', v_email))
            else '{}'::jsonb end)
    returning id into v_id;
  insert into agreement_line_items (agreement_id, name, qty, unit_price, sort)
    values (v_id, case when p_kind = 'design_build' then 'Interior Design and Architectural Plans and Documents for Permit'
                       else 'Feasibility Agreement Fee' end, 1, 0, 0);
  return v_id;
end;
$$;
revoke all on function public.ensure_stage_agreement(uuid, text) from public, anon;
grant execute on function public.ensure_stage_agreement(uuid, text) to authenticated;

-- The feasibility name keeps working for anything that calls it.
create or replace function public.ensure_feasibility_agreement(p_deal_id uuid)
returns uuid
language sql
security definer
set search_path = public
as $$ select public.ensure_stage_agreement(p_deal_id, 'feasibility') $$;

-- 3. Reaching either stage makes its agreement.
create or replace function public.deals_feasibility_agreement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or old.stage is distinct from new.stage then
    if new.stage = 'feasibility_agreement' then perform public.ensure_stage_agreement(new.id, 'feasibility'); end if;
    if new.stage = 'design_build_agreement' then perform public.ensure_stage_agreement(new.id, 'design_build'); end if;
  end if;
  return new;
end;
$$;

-- 4. Deals already on the stage get theirs now.
select public.ensure_stage_agreement(id, 'design_build') from public.deals where stage = 'design_build_agreement';

-- ROLLBACK
--   delete from public.agreements where kind = 'design_build';
--   alter table public.agreements drop constraint agreements_kind_check;
--   alter table public.agreements add constraint agreements_kind_check check (kind = 'feasibility');
--   drop function public.ensure_stage_agreement(uuid, text);
--   (ensure_feasibility_agreement and the trigger function: re-run their bodies from 086 and 082)
