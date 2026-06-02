-- v0.7: Support system foundation
-- Additive only. No data loss. Safe to re-run.

-- ── 1. Add phone/mobile to profiles ─────────────────────────────────────
DO $$ BEGIN ALTER TABLE public.profiles ADD COLUMN phone text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.profiles ADD COLUMN mobile text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ── 2. Notification preferences ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  email_enabled        boolean NOT NULL DEFAULT true,
  sms_enabled          boolean NOT NULL DEFAULT false,
  notify_on_mention    boolean NOT NULL DEFAULT true,
  notify_on_assignment boolean NOT NULL DEFAULT true,
  notify_on_reply      boolean NOT NULL DEFAULT true,
  quiet_hours_start    time,
  quiet_hours_end      time,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY notif_prefs_read ON public.notification_preferences FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY notif_prefs_write ON public.notification_preferences FOR ALL TO authenticated
    USING (profile_id = auth.uid() OR public.current_user_role() = 'owner')
    WITH CHECK (profile_id = auth.uid() OR public.current_user_role() = 'owner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Mentions table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mentions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id       uuid NOT NULL REFERENCES public.crm_activities(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ticket_id         uuid REFERENCES public.tickets(id) ON DELETE CASCADE,
  notified_at       timestamptz,
  read_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mentions_user ON public.mentions(mentioned_user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mentions_activity ON public.mentions(activity_id);

ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY mentions_read ON public.mentions FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY mentions_write ON public.mentions FOR ALL TO authenticated
    USING (public.current_user_role() IN ('editor','owner'))
    WITH CHECK (public.current_user_role() IN ('editor','owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. Notification queue ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel         text NOT NULL CHECK (channel IN ('email', 'sms')),
  subject         text,
  body            text NOT NULL,
  metadata        jsonb DEFAULT '{}',
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  scheduled_for   timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_queue_pending ON public.notification_queue(status, scheduled_for)
  WHERE status IN ('pending', 'failed');

ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY notif_queue_read ON public.notification_queue FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY notif_queue_write ON public.notification_queue FOR ALL TO authenticated
    USING (public.current_user_role() IN ('editor','owner'))
    WITH CHECK (public.current_user_role() IN ('editor','owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 5. Email threading ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ticket_email_threads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  email_thread_id text NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_email_threads ON public.ticket_email_threads(ticket_id);

ALTER TABLE public.ticket_email_threads ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY email_threads_read ON public.ticket_email_threads FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY email_threads_write ON public.ticket_email_threads FOR ALL TO authenticated
    USING (public.current_user_role() IN ('editor','owner'))
    WITH CHECK (public.current_user_role() IN ('editor','owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 6. Assignment rules ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignment_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  priority        integer NOT NULL DEFAULT 0,
  condition       jsonb NOT NULL DEFAULT '{}',
  assign_to       uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  assign_strategy text NOT NULL DEFAULT 'specific'
    CHECK (assign_strategy IN ('specific', 'round_robin', 'least_loaded')),
  team_members    uuid[] DEFAULT '{}',
  enabled         boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assignment_rules_enabled ON public.assignment_rules(priority DESC) WHERE enabled = true;

ALTER TABLE public.assignment_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY assignment_rules_read ON public.assignment_rules FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY assignment_rules_write ON public.assignment_rules FOR ALL TO authenticated
    USING (public.current_user_role() = 'owner')
    WITH CHECK (public.current_user_role() = 'owner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 7. Additions to crm_activities for threading ────────────────────────
DO $$ BEGIN ALTER TABLE public.crm_activities ADD COLUMN message_id text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.crm_activities ADD COLUMN in_reply_to text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.crm_activities ADD COLUMN thread_id text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.crm_activities ADD COLUMN channel_metadata jsonb DEFAULT '{}'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.crm_activities ADD COLUMN is_internal boolean NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_crm_activities_thread ON public.crm_activities(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_activities_message_id ON public.crm_activities(message_id) WHERE message_id IS NOT NULL;

-- ── 8. Realtime for mentions ────────────────────────────────────────────
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.mentions; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 9. Verify ───────────────────────────────────────────────────────────
SELECT 'profiles.phone' AS chk, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='phone') AS ok
UNION ALL SELECT 'profiles.mobile', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='mobile')
UNION ALL SELECT 'notification_preferences', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='notification_preferences')
UNION ALL SELECT 'mentions', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='mentions')
UNION ALL SELECT 'notification_queue', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='notification_queue')
UNION ALL SELECT 'ticket_email_threads', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='ticket_email_threads')
UNION ALL SELECT 'assignment_rules', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='assignment_rules')
UNION ALL SELECT 'crm_activities.message_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_activities' AND column_name='message_id')
UNION ALL SELECT 'crm_activities.is_internal', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_activities' AND column_name='is_internal');
