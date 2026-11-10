-- 082_agreements.sql (ADDITIVE, safe to run twice)
--
-- Stage agreements (Peter, 10 Nov 2026). Each deal stage can need its own
-- contract. The first is the Feasibility Agreement: when a deal is on the
-- Feasibility Agreement stage, an agreement is created on the deal, filled
-- from the deal's contacts and property. Staff add the fee as line items and
-- send a link (like a quote). The client(s) sign and pay on the link, by card
-- (plus a card fee) or by the payment details shown. Steve signs for SEA in
-- the CRM.
--
-- kind names the contract. Only 'feasibility' exists today; later stages add
-- their own kind and text.

-- 1. The agreements.
create table if not exists public.agreements (
  id                   uuid primary key default gen_random_uuid(),
  deal_id              uuid references public.deals(id) on delete cascade,
  kind                 text not null default 'feasibility' check (kind in ('feasibility')),
  -- draft | sent | viewed | signed (every client) | void
  status               text not null default 'draft' check (status in ('draft', 'sent', 'viewed', 'signed', 'void')),
  public_token         text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  contact_id           uuid references public.contacts(id) on delete set null,
  second_contact_id    uuid references public.contacts(id) on delete set null,
  location_id          uuid references public.locations(id) on delete set null,
  -- What the document says, filled from the contacts and property, editable.
  client_names         text,
  property_address     text,
  agreement_date       date not null default current_date,
  payment_details      text,
  card_fee_percent     numeric not null default 1.4 check (card_fee_percent >= 0 and card_fee_percent <= 10),
  total                numeric not null default 0,
  -- Client signatures (a second client signs only when there is one).
  client2_required     boolean not null default false,
  client1_name         text, client1_signed_at timestamptz, client1_signature_path text, client1_ip text,
  client2_name         text, client2_signed_at timestamptz, client2_signature_path text, client2_ip text,
  -- SEA's countersignature, drawn in the CRM.
  seller_name          text not null default 'Steve Albert',
  seller_signed_at     timestamptz, seller_signature_path text,
  seller_signed_by     uuid references public.profiles(id) on delete set null,
  -- Payment: card through Stripe (fee added), or marked paid by staff.
  paid_at              timestamptz,
  amount_paid          numeric,
  card_fee_paid        numeric,
  paid_method          text check (paid_method in ('card', 'check', 'bank_transfer', 'other')),
  stripe_checkout_id   text,
  sent_at              timestamptz,
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists agreements_deal on public.agreements (deal_id);
comment on table public.agreements is 'Stage contracts on a deal (Feasibility Agreement first). Clients sign and pay on /a/<public_token>.';

create table if not exists public.agreement_line_items (
  id           uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements(id) on delete cascade,
  name         text not null default '',
  description  text,
  qty          numeric not null default 1,
  unit_price   numeric not null default 0,
  sort         integer not null default 0
);
create index if not exists agreement_line_items_agreement on public.agreement_line_items (agreement_id, sort);

-- 2. Staff only. The client sees the agreement through the agreement-public
--    function, never the tables.
alter table public.agreements enable row level security;
alter table public.agreement_line_items enable row level security;
revoke all on public.agreements, public.agreement_line_items from anon;
drop policy if exists agreements_read on public.agreements;
create policy agreements_read on public.agreements for select to authenticated
  using (public.current_user_role() in ('owner', 'editor', 'viewer'));
drop policy if exists agreements_write on public.agreements;
create policy agreements_write on public.agreements for all to authenticated
  using (public.current_user_role() in ('owner', 'editor'))
  with check (public.current_user_role() in ('owner', 'editor'));
drop policy if exists agreement_lines_read on public.agreement_line_items;
create policy agreement_lines_read on public.agreement_line_items for select to authenticated
  using (public.current_user_role() in ('owner', 'editor', 'viewer'));
drop policy if exists agreement_lines_write on public.agreement_line_items;
create policy agreement_lines_write on public.agreement_line_items for all to authenticated
  using (public.current_user_role() in ('owner', 'editor'))
  with check (public.current_user_role() in ('owner', 'editor'));

-- 3. A deal on the Feasibility Agreement stage gets its agreement, filled from
--    the deal's contacts (first two linked) and property (first linked).
create or replace function public.ensure_feasibility_agreement(p_deal_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_c1 uuid; v_c2 uuid; v_loc uuid;
  v_names text; v_addr text; v_details text;
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

  insert into agreements (deal_id, kind, contact_id, second_contact_id, location_id, client_names, property_address, payment_details, client2_required)
    values (p_deal_id, 'feasibility', v_c1, v_c2, v_loc, nullif(v_names, ''), v_addr, v_details, v_c2 is not null)
    returning id into v_id;
  insert into agreement_line_items (agreement_id, name, qty, unit_price, sort)
    values (v_id, 'Feasibility Agreement Fee', 1, 0, 0);
  return v_id;
end;
$$;
revoke all on function public.ensure_feasibility_agreement(uuid) from public, anon;
grant execute on function public.ensure_feasibility_agreement(uuid) to authenticated;

create or replace function public.deals_feasibility_agreement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage = 'feasibility_agreement' and (tg_op = 'INSERT' or old.stage is distinct from new.stage) then
    perform public.ensure_feasibility_agreement(new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_deals_feasibility_agreement on public.deals;
create trigger trg_deals_feasibility_agreement
  after insert or update of stage on public.deals
  for each row execute function public.deals_feasibility_agreement();

-- 4. Deals already on the stage get theirs now.
select public.ensure_feasibility_agreement(id) from public.deals where stage = 'feasibility_agreement';

-- ROLLBACK
--   drop trigger trg_deals_feasibility_agreement on public.deals;
--   drop function public.deals_feasibility_agreement();
--   drop function public.ensure_feasibility_agreement(uuid);
--   drop table public.agreement_line_items;
--   drop table public.agreements;
