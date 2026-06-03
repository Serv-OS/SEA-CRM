-- Migration 010: In-app notifications
-- A per-user notification feed shown in the notification bell, plus an
-- assignment producer so the feed has real content immediately.

CREATE TABLE IF NOT EXISTS public.notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  type          text NOT NULL DEFAULT 'system',  -- assignment | mention | reply | system
  title         text NOT NULL,
  body          text,
  entity_type   text,   -- ticket | deal | task | onboarding | project | lead
  link_id       uuid,   -- record to open when clicked
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(recipient_id) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY notifications_read ON public.notifications FOR SELECT TO authenticated USING (recipient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated
    USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Realtime so the bell updates live
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Assignment producer: notify the new owner (unless they assigned it to themselves)
CREATE OR REPLACE FUNCTION public.notify_on_assignment() RETURNS trigger AS $$
DECLARE
  actor uuid := auth.uid();
  ent text := TG_ARGV[0];
  j jsonb := to_jsonb(NEW);
  title_text text;
BEGIN
  IF NEW.owner_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN RETURN NEW; END IF;
  IF actor IS NOT NULL AND NEW.owner_id = actor THEN RETURN NEW; END IF;  -- skip self-assignment

  title_text := COALESCE(j->>'subject', j->>'name', j->>'title', initcap(ent));

  INSERT INTO public.notifications (recipient_id, actor_id, type, title, body, entity_type, link_id)
  VALUES (NEW.owner_id, actor, 'assignment',
          'Assigned to you: ' || title_text,
          initcap(ent) || ' assigned to you', ent, NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach to every assignable record type
DROP TRIGGER IF EXISTS trg_assign_notify ON public.tickets;
CREATE TRIGGER trg_assign_notify AFTER INSERT OR UPDATE OF owner_id ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_assignment('ticket');

DROP TRIGGER IF EXISTS trg_assign_notify ON public.deals;
CREATE TRIGGER trg_assign_notify AFTER INSERT OR UPDATE OF owner_id ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_assignment('deal');

DROP TRIGGER IF EXISTS trg_assign_notify ON public.tasks;
CREATE TRIGGER trg_assign_notify AFTER INSERT OR UPDATE OF owner_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_assignment('task');

DROP TRIGGER IF EXISTS trg_assign_notify ON public.onboardings;
CREATE TRIGGER trg_assign_notify AFTER INSERT OR UPDATE OF owner_id ON public.onboardings
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_assignment('onboarding');

DROP TRIGGER IF EXISTS trg_assign_notify ON public.crm_projects;
CREATE TRIGGER trg_assign_notify AFTER INSERT OR UPDATE OF owner_id ON public.crm_projects
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_assignment('project');

DROP TRIGGER IF EXISTS trg_assign_notify ON public.leads;
CREATE TRIGGER trg_assign_notify AFTER INSERT OR UPDATE OF owner_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_assignment('lead');
