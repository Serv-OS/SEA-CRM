-- Auto-create an onboarding whenever a deal enters closed_won, via ANY path
-- (board drag, edit form, quote sign, "Mark Won"). Previously only quote-sign /
-- Mark-Won created it, so deals moved to Won on the board got no onboarding —
-- and even those FAILED for company-less (construction) deals because
-- onboardings.company_id was NOT NULL. Decouple it from company first.
ALTER TABLE public.onboardings ALTER COLUMN company_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.create_onboarding_on_won()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE ob_id uuid;
BEGIN
  IF NEW.stage = 'closed_won' AND COALESCE(OLD.stage, '') <> 'closed_won' THEN
    SELECT id INTO ob_id FROM public.onboardings WHERE deal_id = NEW.id LIMIT 1;
    IF ob_id IS NULL THEN
      INSERT INTO public.onboardings (company_id, deal_id, owner_id, target_go_live, notes)
        VALUES (NEW.company_id, NEW.id, NEW.owner_id, NEW.expected_close_date,
                'Auto-created from won deal: ' || COALESCE(NEW.name, ''))
        RETURNING id INTO ob_id;
      INSERT INTO public.stage_history (object_type, object_id, from_stage, to_stage, changed_by)
        VALUES ('onboarding', ob_id, NULL, 'kickoff', NEW.owner_id);
      -- carry the deal's location + contact associations onto the onboarding
      INSERT INTO public.associations (from_type, from_id, to_type, to_id, label)
        SELECT 'onboarding', ob_id, a.to_type, a.to_id,
               COALESCE(a.label, CASE a.to_type WHEN 'location' THEN 'affected_location' ELSE 'primary_contact' END)
        FROM public.associations a
        WHERE a.from_type = 'deal' AND a.from_id = NEW.id AND a.to_type IN ('location', 'contact');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_onboarding ON public.deals;
CREATE TRIGGER trg_deal_onboarding AFTER UPDATE OF stage ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.create_onboarding_on_won();

-- Backfill: existing closed_won deals that never got an onboarding.
DO $$
DECLARE r RECORD; ob uuid;
BEGIN
  FOR r IN SELECT * FROM public.deals d
           WHERE d.stage = 'closed_won'
             AND NOT EXISTS (SELECT 1 FROM public.onboardings o WHERE o.deal_id = d.id) LOOP
    INSERT INTO public.onboardings (company_id, deal_id, owner_id, target_go_live, notes)
      VALUES (r.company_id, r.id, r.owner_id, r.expected_close_date,
              'Auto-created (backfill) from won deal: ' || COALESCE(r.name, '')) RETURNING id INTO ob;
    INSERT INTO public.stage_history (object_type, object_id, from_stage, to_stage, changed_by)
      VALUES ('onboarding', ob, NULL, 'kickoff', r.owner_id);
    INSERT INTO public.associations (from_type, from_id, to_type, to_id, label)
      SELECT 'onboarding', ob, a.to_type, a.to_id,
             COALESCE(a.label, CASE a.to_type WHEN 'location' THEN 'affected_location' ELSE 'primary_contact' END)
      FROM public.associations a
      WHERE a.from_type = 'deal' AND a.from_id = r.id AND a.to_type IN ('location', 'contact');
  END LOOP;
END $$;

-- Backfill: sync each deal's value to its latest quote's total so the deal and
-- the quote always show the same number (contract value).
UPDATE public.deals d SET value = sub.one_off_total
FROM (
  SELECT DISTINCT ON (deal_id) deal_id, one_off_total
  FROM public.quotes WHERE deal_id IS NOT NULL
  ORDER BY deal_id, created_at DESC
) sub
WHERE sub.deal_id = d.id AND sub.one_off_total > 0;
