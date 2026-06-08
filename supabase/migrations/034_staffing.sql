-- Staffing / workforce module: departments, areas (coverage flags), shifts,
-- time off. Staff = existing public.profiles (scheduling fields added below).

-- ── Departments ─────────────────────────────────────────────────────────────
create table if not exists public.departments (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  colour       text default '#15C26A',
  lead_user_id uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ── Areas (global coverage flags, scoped by allowed_department_ids) ──────────
create table if not exists public.areas (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  colour                 text default '#7C5CFF',
  description            text,
  required_per_day       int not null default 1,
  allowed_department_ids uuid[] not null default '{}',  -- empty = all departments
  created_at             timestamptz not null default now()
);

-- ── Scheduling fields on existing staff (profiles) ──────────────────────────
alter table public.profiles add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.profiles add column if not exists coverable_area_ids uuid[] not null default '{}';
alter table public.profiles add column if not exists default_weekly_hours numeric default 40;
alter table public.profiles add column if not exists leave_entitlement_days numeric default 28;

-- ── Shifts ──────────────────────────────────────────────────────────────────
create table if not exists public.shifts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  date        date not null,
  start_time  text not null,           -- 'HH:MM'
  finish_time text not null,           -- 'HH:MM'
  area_id     uuid references public.areas(id) on delete set null,
  status      text not null default 'draft' check (status in ('draft','published')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_shifts_date on public.shifts(date);
create index if not exists idx_shifts_user on public.shifts(user_id, date);
create index if not exists idx_shifts_area on public.shifts(area_id, date);

-- ── Time off ────────────────────────────────────────────────────────────────
create table if not exists public.time_off (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null check (type in ('holiday','sick')),
  start_date  date not null,
  end_date    date not null,
  days        numeric not null default 1,
  note        text,
  status      text not null default 'pending' check (status in ('pending','approved','denied')),
  decided_by  uuid references public.profiles(id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_time_off_user on public.time_off(user_id);
create index if not exists idx_time_off_dates on public.time_off(start_date, end_date);

-- ── RLS: any signed-in user reads; owners/editors write ─────────────────────
do $$
declare t text;
begin
  foreach t in array array['departments','areas','shifts','time_off'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (auth.uid() is not null)', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format($f$create policy %I_write on public.%I for all
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','editor')))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','editor')))$f$, t, t);
  end loop;
end $$;

-- ── Seed departments + areas (only if empty) ────────────────────────────────
insert into public.departments (name, colour)
select v.name, v.colour from (values
  ('Sales','#15C26A'), ('Customer Support','#7C5CFF'), ('Implementation','#E8743C')
) as v(name, colour)
where not exists (select 1 from public.departments);

insert into public.areas (name, colour, required_per_day)
select v.name, v.colour, v.req from (values
  ('Phones','#15C26A',2), ('Support','#7C5CFF',2), ('On Call','#E8743C',1)
) as v(name, colour, req)
where not exists (select 1 from public.areas);
