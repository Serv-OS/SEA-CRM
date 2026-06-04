-- Migration 022: in-app Stripe connection (key stored server-side only)
CREATE TABLE IF NOT EXISTS public.stripe_connection (
  id             int PRIMARY KEY DEFAULT 1,
  secret_key     text,
  webhook_secret text,
  webhook_id     text,
  account_id     text,
  account_name   text,
  livemode       boolean,
  connected_at   timestamptz,
  CONSTRAINT stripe_connection_singleton CHECK (id = 1)
);
-- RLS on with NO policies => only the service role (edge functions) can touch it.
-- The secret key is never exposed to the browser.
ALTER TABLE public.stripe_connection ENABLE ROW LEVEL SECURITY;
