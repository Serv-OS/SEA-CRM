-- 068_location_state.sql  (ADDITIVE) — capture full US address on leads/locations.
-- The public lead form collects street/city/state/zip; locations already have
-- address/city/postcode/country but no state. Add it.
alter table public.locations add column if not exists state text;
