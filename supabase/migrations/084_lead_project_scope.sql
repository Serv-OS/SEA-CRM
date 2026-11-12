-- 084: project scope on leads (SEA Design Build, 12 Nov 2026, CRM 0.9.110)
-- The lead carried venue type, covers and current POS from the restaurant CRM
-- it was cloned from. A construction lead carries ONE field for the job: the
-- project scope. The website's "Service Required" answers land here too.

alter table public.leads add column if not exists project_scope text;

-- Carry the 80 website leads over: their Service Required was stored in venue_type.
update public.leads set project_scope = case lower(trim(venue_type))
  when 'bathroom remodel' then 'bathroom'
  when 'kitchen remodel' then 'kitchen'
  when 'home or room addition' then 'addition'
  when 'full home remodel' then 'remodel'
  when 'new construction' then 'new_construction'
  when 'adu' then 'adu'
  when 'other' then 'other'
  else 'other' end
where project_scope is null and venue_type is not null and trim(venue_type) <> '';

-- Both website forms: Service Required now lands on the lead's project scope.
update public.forms f set fields = (
  select jsonb_agg(
    case when e->>'label' = 'Service Required' then e || '{"maps_to":"project_scope"}'::jsonb else e end
    order by o)
  from jsonb_array_elements(f.fields) with ordinality as t(e, o))
where slug in ('consultation', 'contact');

-- Check: expect 1 scope field on each form, and every website lead with a scope.
select slug, (select count(*) from jsonb_array_elements(fields) e where e->>'maps_to' = 'project_scope') as scope_fields
from public.forms where slug in ('consultation', 'contact');
select project_scope, count(*) from public.leads group by 1 order by 2 desc;
