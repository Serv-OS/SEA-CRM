-- Card processing: per-customer rate accounts + monthly volume/revenue.
-- Revenue model = margin (our sell rate − our buy/cost rate) × volume.
-- Designed so a future partner-sync edge function inserts volume rows (source='partner').

create table if not exists public.processing_accounts (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid references public.companies(id) on delete set null,
  location_id             uuid references public.locations(id) on delete set null,
  label                   text,
  status                  text not null default 'prospect' check (status in ('prospect','live','churned')),
  -- what they pay now (competitor pitch)
  current_rate_pct        numeric,
  current_txn_fee         numeric,
  current_monthly_volume  numeric,
  -- what we charge them
  our_rate_pct            numeric,
  our_txn_fee             numeric,
  -- our cost from the processor (drives margin)
  buy_rate_pct            numeric,
  buy_txn_fee             numeric,
  -- automation hook
  partner                 text,
  merchant_ref            text,
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists idx_processing_accounts_company on public.processing_accounts(company_id);

create table if not exists public.processing_volumes (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.processing_accounts(id) on delete cascade,
  period           date not null,                 -- first of month
  amount_processed numeric not null default 0,
  transactions     integer,
  our_revenue      numeric,                        -- recorded actual; null = estimate from margin
  source           text not null default 'manual' check (source in ('manual','partner')),
  created_at       timestamptz not null default now()
);
create unique index if not exists uniq_processing_volume_period on public.processing_volumes(account_id, period);
create index if not exists idx_processing_volumes_period on public.processing_volumes(period);

do $$
declare t text;
begin
  foreach t in array array['processing_accounts','processing_volumes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (auth.uid() is not null)', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format($f$create policy %I_write on public.%I for all
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','editor')))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','editor')))$f$, t, t);
  end loop;
end $$;
