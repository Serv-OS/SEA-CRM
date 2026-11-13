-- 085: SEA lead flow (12 Nov 2026, CRM 0.9.112)
-- New > Sent Initial Response Email > Follow Up > Qualified > Deals / Clients
-- The POS names attempting and contacted become responded and follow_up.
-- Deals / Clients is not a stage: it is a qualified lead that has its deal.

update public.leads set stage = 'responded' where stage = 'attempting';
update public.leads set stage = 'follow_up' where stage = 'contacted';

alter table public.leads drop constraint if exists leads_stage_check;
alter table public.leads add constraint leads_stage_check
  check (stage = any (array['new_lead'::text, 'responded'::text, 'follow_up'::text, 'qualified'::text, 'disqualified'::text]));

-- Check: expect no attempting or contacted left.
select stage, count(*) from public.leads group by 1 order by 2 desc;
