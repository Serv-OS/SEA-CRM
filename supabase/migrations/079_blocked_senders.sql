-- Junk: senders whose mail we no longer want as tickets.
--
-- Mirrors how internal senders are already skipped in ms-check, but data-driven
-- so the team can manage it without a deploy. Two kinds:
--   email   block one address          (spammer@example.com)
--   domain  block a whole domain       (example.com)
-- Domain blocks earn their place: most junk arrives from a throwaway address on
-- a domain that keeps sending, so blocking one address at a time never ends.
create table if not exists public.blocked_senders (
  id          uuid primary key default gen_random_uuid(),
  value       text not null,
  kind        text not null default 'email' check (kind in ('email','domain')),
  reason      text,
  blocked_by  uuid references public.profiles(id) on delete set null,
  hits        integer not null default 0,      -- messages refused since blocking
  last_hit_at timestamptz,
  created_at  timestamptz not null default now()
);

-- One rule per value: blocking the same address twice is a no-op, not a duplicate.
create unique index if not exists blocked_senders_value_key
  on public.blocked_senders (lower(value));

alter table public.blocked_senders enable row level security;

drop policy if exists blocked_senders_read on public.blocked_senders;
create policy blocked_senders_read on public.blocked_senders
  for select using (auth.uid() is not null);

drop policy if exists blocked_senders_write on public.blocked_senders;
create policy blocked_senders_write on public.blocked_senders
  for all using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['owner','editor'])
  )) with check (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['owner','editor'])
  ));
