-- 067_tickets_contact.sql  (ADDITIVE ONLY — parity with psc-crm)
-- Support tickets must be raisable against a PERSON (contact), not only a
-- company/location — one site can have many people. SEA's clone was missing
-- these columns; the other CRMs already have them (idempotent no-op there).
alter table public.tickets add column if not exists contact_id uuid references public.contacts(id) on delete set null;
alter table public.tickets add column if not exists customer_email text;
alter table public.tickets add column if not exists customer_phone text;
alter table public.tickets add column if not exists channel text;
create index if not exists idx_tickets_contact_id on public.tickets(contact_id);
