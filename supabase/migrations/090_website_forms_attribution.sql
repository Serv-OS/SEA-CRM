-- 090: the new website's forms and ad attribution (23 Nov 2026, CRM 0.9.126)
-- Safe to run twice.
--
-- 1. Leads remember where they came from: the Google Ads click id, the UTMs,
--    the first page they landed on and when. The website sends these with
--    every form; forms-public writes them.
-- 2. A new form, "website-quick", for the new seadesignbuild.com. Its short
--    forms (hero, service, city, blog) have no street address, so only first
--    name and email are required. The old "consultation" form is untouched.

alter table public.leads
  add column if not exists gclid          text,
  add column if not exists gbraid         text,
  add column if not exists wbraid         text,
  add column if not exists utm_source     text,
  add column if not exists utm_medium     text,
  add column if not exists utm_campaign   text,
  add column if not exists utm_term       text,
  add column if not exists utm_content    text,
  add column if not exists landing_page   text,
  add column if not exists first_touch_at timestamptz,
  add column if not exists referrer       text;

create index if not exists idx_leads_gclid on public.leads (gclid) where gclid is not null;

insert into public.forms (name, slug, description, destination, source_tag, fields, settings, enabled)
values (
  'Website (new site)',
  'website-quick',
  'Every form on the new seadesignbuild.com: hero, service, city, area, blog, contact and the cost estimator.',
  'lead',
  'website',
  '[
    {"key":"first_name","type":"text","label":"First Name","maps_to":"first_name","required":true},
    {"key":"last_name","type":"text","label":"Last Name","maps_to":"last_name","required":false},
    {"key":"email","type":"email","label":"Email","maps_to":"email","required":true},
    {"key":"phone","type":"tel","label":"Mobile Phone Number","maps_to":"phone","required":false},
    {"key":"address","type":"text","label":"Street Address","maps_to":"location_address","required":false},
    {"key":"city","type":"text","label":"City","maps_to":"location_city","required":false},
    {"key":"state","type":"text","label":"State","maps_to":"location_state","required":false},
    {"key":"zip","type":"text","label":"ZIP Code","maps_to":"location_postcode","required":false},
    {"key":"service","type":"select","label":"Service Required","maps_to":"project_scope","options":["Kitchen remodel","Bathroom remodel","Home or room addition","Full home remodel","Other"],"required":false},
    {"key":"details","type":"textarea","label":"Project details","maps_to":"message","required":false},
    {"key":"timeline","type":"text","label":"Wants to start","maps_to":"none","required":false},
    {"key":"budget","type":"text","label":"Budget range","maps_to":"none","required":false},
    {"key":"estimate","type":"text","label":"Estimator choices","maps_to":"none","required":false},
    {"key":"estimate_range","type":"text","label":"Estimate shown","maps_to":"none","required":false},
    {"key":"sms_consent","type":"text","label":"Agreed to texts","maps_to":"none","required":false},
    {"key":"website_form","type":"text","label":"Website form","maps_to":"none","required":false}
  ]'::jsonb,
  '{"success_message":"Thanks. We will be in touch within one business day.","default_priority":"warm"}'::jsonb,
  true
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description, fields = excluded.fields, settings = excluded.settings, enabled = true;

-- Check: expect 11 new columns and the form with 16 fields, 2 required.
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'leads'
       and column_name in ('gclid','gbraid','wbraid','utm_source','utm_medium','utm_campaign','utm_term','utm_content','landing_page','first_touch_at','referrer')) as attribution_columns,
  (select jsonb_array_length(fields) from public.forms where slug = 'website-quick') as form_fields,
  (select count(*) from public.forms f, jsonb_array_elements(f.fields) e where f.slug = 'website-quick' and (e->>'required')::boolean) as required_fields;
