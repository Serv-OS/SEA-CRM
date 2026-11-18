-- 088_construction_contract.sql (ADDITIVE, safe to run twice)
--
-- The third stage contract (Peter, 18 Nov 2026): SEA's fixed price
-- Construction Contract, made on the deal when it reaches the Construction
-- Contract stage, like the Feasibility and Design / Build agreements.
--
-- What differs:
--   - Nothing is paid on the link: construction is billed twice a month on the
--     percentage complete, so due_amount is 0 and the link has no pay step.
--   - Every clause carries the owners' initials. Each owner types their
--     initials once when signing and they print on every Initials line, so the
--     initials are kept with the signature (client1_initials, client2_initials).
--   - details holds the fill-ins: the estimate and scope date (Exhibit A),
--     completion time in months, storage, payment terms, warranty years, the
--     markup on purchases, and the owners' mailing address, phone and email.

-- 1. The new kind and the initials.
alter table public.agreements drop constraint if exists agreements_kind_check;
alter table public.agreements add constraint agreements_kind_check check (kind in ('feasibility', 'design_build', 'construction'));
alter table public.agreements
  add column if not exists client1_initials text,
  add column if not exists client2_initials text;
comment on column public.agreements.client1_initials is 'Initials the first owner typed when signing; printed on every Initials line (construction contract).';

-- 2. Making an agreement knows the construction contract.
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
  if p_kind not in ('feasibility', 'design_build', 'construction') then raise exception 'Unknown agreement kind %', p_kind; end if;
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
            -- Construction is billed twice a month as the work goes, nothing up front.
            case when p_kind = 'design_build' then 3000 when p_kind = 'construction' then 0 end,
            case when p_kind = 'design_build' then jsonb_strip_nulls(jsonb_build_object(
              'jurisdiction', case when v_city is not null then 'City of ' || v_city end,
              'interior_designer', 'Patricia McIntosh',
              'ca_hourly', 150, 'revision_hourly', 250, 'valid_days', 30,
              'mailing_address', v_addr, 'client_phone', v_phone, 'client_email', v_email))
            when p_kind = 'construction' then jsonb_strip_nulls(jsonb_build_object(
              'completion_months', null, 'warranty_years', 10, 'markup_percent', 20,
              'storage', 'Construction will require the garage for storage and placement of materials to be used on the project.',
              'payment_terms', 'Billed Twice-Monthly based on Actual Percentage of Completion and Installed Labor and Materials (Due and payable upon receipt).',
              'mailing_address', v_addr, 'client_phone', v_phone, 'client_email', v_email))
            else '{}'::jsonb end)
    returning id into v_id;
  insert into agreement_line_items (agreement_id, name, qty, unit_price, sort)
    values (v_id, case when p_kind = 'design_build' then 'Interior Design and Architectural Plans and Documents for Permit'
                       when p_kind = 'construction' then 'Fixed price for the work of improvement'
                       else 'Feasibility Agreement Fee' end, 1, 0, 0);
  return v_id;
end;
$$;


-- 3. Reaching the Construction Contract stage makes it.
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
    if new.stage = 'construction_contract' then perform public.ensure_stage_agreement(new.id, 'construction'); end if;
  end if;
  return new;
end;
$$;

-- 4. Deals already on the stage get theirs now.
select public.ensure_stage_agreement(id, 'construction') from public.deals where stage = 'construction_contract';

-- ROLLBACK
--   delete from public.agreements where kind = 'construction';
--   alter table public.agreements drop constraint agreements_kind_check;
--   alter table public.agreements add constraint agreements_kind_check check (kind in ('feasibility', 'design_build'));
--   alter table public.agreements drop column client1_initials, drop column client2_initials;
--   (ensure_stage_agreement and the trigger function: re-run their bodies from 087)
