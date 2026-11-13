-- 086_scope_of_work.sql (ADDITIVE, safe to run twice)
--
-- Scope of work (Peter, 13 Nov 2026). The lead's Scope of work box becomes
-- version 1 on the deal. Every stage contract carries the scope current when
-- it is made (the Feasibility Agreement first). At a later stage a new scope
-- is added as the next version; the old ones are kept so the change is seen.
--
-- deal_scopes: one row per version per deal, newest version = current.
-- agreements.scope_of_work: the copy on the contract, fixed once a client signs.

-- 1. The versions.
create table if not exists public.deal_scopes (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid not null references public.deals(id) on delete cascade,
  version      integer not null,
  body         text not null,
  -- The deal stage when this version was written, so the history reads
  -- "v2 at Initial Designs".
  stage        text,
  agreement_id uuid references public.agreements(id) on delete set null,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (deal_id, version)
);
create index if not exists deal_scopes_deal on public.deal_scopes (deal_id, version desc);
comment on table public.deal_scopes is 'Scope of work versions on a deal. The highest version is the current scope.';

alter table public.deal_scopes enable row level security;
revoke all on public.deal_scopes from anon;
drop policy if exists deal_scopes_read on public.deal_scopes;
create policy deal_scopes_read on public.deal_scopes for select to authenticated
  using (public.current_user_role() in ('owner', 'editor', 'viewer'));
drop policy if exists deal_scopes_write on public.deal_scopes;
create policy deal_scopes_write on public.deal_scopes for all to authenticated
  using (public.current_user_role() in ('owner', 'editor'))
  with check (public.current_user_role() in ('owner', 'editor'));

-- 2. The copy on each contract.
alter table public.agreements add column if not exists scope_of_work text;
comment on column public.agreements.scope_of_work is 'The scope of work this contract was made with. Fixed once a client signs.';

-- 3. Add a version. Unsigned contracts on the deal take the new scope too, so
--    a scope written on the deal page or on the agreement page is the same one.
create or replace function public.add_deal_scope(p_deal_id uuid, p_body text, p_agreement_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_version integer;
  v_stage text;
  v_body text := nullif(trim(p_body), '');
begin
  if v_body is null then return null; end if;
  select stage into v_stage from deals where id = p_deal_id;
  if v_stage is null then raise exception 'No deal %', p_deal_id; end if;
  -- Writing the same words again is not a new version.
  select id into v_id from deal_scopes where deal_id = p_deal_id order by version desc limit 1;
  if v_id is not null and (select body from deal_scopes where id = v_id) = v_body then
    update agreements set scope_of_work = v_body
      where deal_id = p_deal_id and client1_signed_at is null and status <> 'void' and scope_of_work is distinct from v_body;
    return v_id;
  end if;
  select coalesce(max(version), 0) + 1 into v_version from deal_scopes where deal_id = p_deal_id;
  insert into deal_scopes (deal_id, version, body, stage, agreement_id, created_by)
    values (p_deal_id, v_version, v_body, v_stage, p_agreement_id, auth.uid())
    returning id into v_id;
  update agreements set scope_of_work = v_body
    where deal_id = p_deal_id and client1_signed_at is null and status <> 'void';
  return v_id;
end;
$$;
revoke all on function public.add_deal_scope(uuid, text, uuid) from public, anon;
grant execute on function public.add_deal_scope(uuid, text, uuid) to authenticated;

-- 4. A new Feasibility Agreement is made with the deal's current scope.
create or replace function public.ensure_feasibility_agreement(p_deal_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_c1 uuid; v_c2 uuid; v_loc uuid;
  v_names text; v_addr text; v_details text; v_scope text;
begin
  select id into v_id from agreements
    where deal_id = p_deal_id and kind = 'feasibility' and status <> 'void' limit 1;
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
  select nullif(concat_ws(', ', nullif(address, ''), nullif(city, ''), nullif(trim(concat_ws(' ', nullif(state, ''), nullif(postcode, ''))), '')), '')
    into v_addr from locations where id = v_loc;
  -- Payment details carry over from the last agreement, so they are typed once.
  select payment_details into v_details from agreements
    where payment_details is not null order by created_at desc limit 1;
  -- The deal's current scope of work.
  select body into v_scope from deal_scopes where deal_id = p_deal_id order by version desc limit 1;

  insert into agreements (deal_id, kind, contact_id, second_contact_id, location_id, client_names, property_address, payment_details, client2_required, scope_of_work)
    values (p_deal_id, 'feasibility', v_c1, v_c2, v_loc, nullif(v_names, ''), v_addr, v_details, v_c2 is not null, v_scope)
    returning id into v_id;
  insert into agreement_line_items (agreement_id, name, qty, unit_price, sort)
    values (v_id, 'Feasibility Agreement Fee', 1, 0, 0);
  return v_id;
end;
$$;

-- 5. Deals already made from a lead: the lead's Scope of work box is version 1.
insert into public.deal_scopes (deal_id, version, body, stage, created_by, created_at)
select l.deal_id, 1, l.notes, d.stage, l.owner_id, d.created_at
  from public.leads l
  join public.deals d on d.id = l.deal_id
 where nullif(trim(l.notes), '') is not null
   and not exists (select 1 from public.deal_scopes s where s.deal_id = l.deal_id);

-- 6. Unsigned contracts without a scope take the deal's current one.
update public.agreements a
   set scope_of_work = s.body
  from (select distinct on (deal_id) deal_id, body from public.deal_scopes order by deal_id, version desc) s
 where s.deal_id = a.deal_id and a.scope_of_work is null and a.client1_signed_at is null and a.status <> 'void';

-- ROLLBACK
--   drop function public.add_deal_scope(uuid, text, uuid);
--   alter table public.agreements drop column scope_of_work;
--   drop table public.deal_scopes;
--   (ensure_feasibility_agreement: re-run the body in 082)
