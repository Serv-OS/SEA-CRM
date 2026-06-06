-- Per-user email signature, appended to replies sent from the personal inbox.
alter table public.profiles add column if not exists email_signature text;
