-- Migration 028: per-user Google connection (personal inbox + calendar)
CREATE TABLE IF NOT EXISTS public.user_integrations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  provider         text NOT NULL DEFAULT 'google',
  email            text,
  access_token     text,
  refresh_token    text,
  token_expires_at timestamptz,
  scope            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
-- A user manages only their own connection; edge functions use the service role.
DO $$ BEGIN
  CREATE POLICY user_integrations_rw ON public.user_integrations FOR ALL TO authenticated
    USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
