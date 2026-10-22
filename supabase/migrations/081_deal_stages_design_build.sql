-- 081_deal_stages_design_build.sql (safe to run twice)
--
-- SEA's pipeline is design and build, not quote and sign. Peter, 22 Oct 2026:
--   Feasibility Agreement, Initial Designs, Preliminary Estimate,
--   Design Build Agreement, Bidding, Construction Contract, Won, Lost.
-- Won and Lost keep their keys (closed_won / closed_lost): reports, the build
-- hand-off and quote acceptance all key on them.

begin;

alter table public.deals drop constraint if exists deals_stage_check;

-- Old construction stages onto the nearest new one. On 22 Oct every live deal
-- (3) was on contract_signed.
update public.deals set stage = case stage
    when 'estimate'        then 'preliminary_estimate'
    when 'proposal_sent'   then 'design_build_agreement'
    when 'negotiation'     then 'bidding'
    when 'verbal'          then 'bidding'
    when 'contract_signed' then 'construction_contract'
    else stage end
  where stage in ('estimate','proposal_sent','negotiation','verbal','contract_signed');

alter table public.deals alter column stage set default 'feasibility_agreement';

alter table public.deals add constraint deals_stage_check check (stage in (
  'feasibility_agreement','initial_designs','preliminary_estimate',
  'design_build_agreement','bidding','construction_contract',
  'closed_won','closed_lost'));

commit;

-- Check: every deal on a new stage
select stage, count(*) from public.deals group by stage order by stage;
