-- 080_deal_stages_sea.sql (ADDITIVE, safe to run twice)
--
-- The deals table still carried the POS pipeline it was cloned from: the
-- default stage was 'new_lead' and the CHECK allowed only
-- new_lead / contacted / qualified / demo_booked / demo_done / proposal_sent /
-- negotiation / closed_won / closed_lost.
--
-- The construction pipeline on screen is a different set entirely:
-- estimate / proposal_sent / negotiation / verbal / contract_signed, then
-- won or lost. Two things went wrong because of that gap:
--
--  1. Qualifying a lead inserted a deal WITHOUT a stage, so it took the
--     database default, 'new_lead'. No column on the board matches that word,
--     so the deal was created and then was nowhere to be seen. The matching
--     stage_history row said 'estimate' the whole time, which is the giveaway.
--  2. Setting the right stage was REFUSED by the old CHECK, and the client
--     threw the error away, so the screen looked like it did nothing at all.
--
-- This migration makes the database agree with the pipeline. The client fix
-- (an explicit stage on create, and errors that are shown) ships alongside it.
--
-- ROLLBACK, if ever needed:
--   alter table public.deals drop constraint deals_stage_check;
--   alter table public.deals alter column stage set default 'new_lead';
--   alter table public.deals add constraint deals_stage_check check (stage in
--     ('new_lead','contacted','qualified','demo_booked','demo_done',
--      'proposal_sent','negotiation','closed_won','closed_lost'));
--   (rows already moved to 'estimate' would stay there)

begin;

-- 1. Let the old words go.
alter table public.deals drop constraint if exists deals_stage_check;

-- 2. Move any deal still sitting on a POS stage onto the nearest real one.
--    A deal that was 'new_lead', 'contacted' or 'qualified' has been quoted or
--    is about to be, so it starts at the beginning of the pipeline. A booked or
--    completed demo is the closest thing the old set had to a sent proposal.
update public.deals set stage = case stage
    when 'new_lead'    then 'estimate'
    when 'contacted'   then 'estimate'
    when 'qualified'   then 'estimate'
    when 'demo_booked' then 'proposal_sent'
    when 'demo_done'   then 'proposal_sent'
    else stage
  end
 where stage in ('new_lead','contacted','qualified','demo_booked','demo_done');

-- 3. A new deal starts where the work starts: quoting it.
alter table public.deals alter column stage set default 'estimate';

-- 4. Only the construction pipeline from here.
alter table public.deals add constraint deals_stage_check
  check (stage in ('estimate','proposal_sent','negotiation','verbal',
                   'contract_signed','closed_won','closed_lost'));

commit;

-- stage_history is deliberately untouched: it is a log of what happened, and
-- rewriting history would hide the drift rather than record it. The client
-- prints old keys as plain words (src/lib/dealStages.js).
