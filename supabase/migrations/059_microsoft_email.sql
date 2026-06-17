-- Microsoft 365 (Outlook/Exchange via Microsoft Graph) email integration.
-- Mirrors the Gmail integration: a shared SUPPORT mailbox lives here; per-user
-- personal mailboxes reuse user_integrations with provider='microsoft'.

CREATE TABLE IF NOT EXISTS public.microsoft_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  connected_by uuid,
  is_active boolean NOT NULL DEFAULT true,
  last_polled_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.microsoft_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ms_conn_read ON public.microsoft_connections;
DROP POLICY IF EXISTS ms_conn_write ON public.microsoft_connections;
-- Same access model as gmail_connections: staff can read status, only owners connect/disconnect.
CREATE POLICY ms_conn_read ON public.microsoft_connections FOR SELECT TO authenticated USING (true);
CREATE POLICY ms_conn_write ON public.microsoft_connections FOR ALL TO authenticated
  USING (current_user_role() = 'owner') WITH CHECK (current_user_role() = 'owner');

-- Public OAuth config (client id + tenant are not secret; the client secret is a Supabase secret).
ALTER TABLE public.support_settings ADD COLUMN IF NOT EXISTS microsoft_client_id text;
ALTER TABLE public.support_settings ADD COLUMN IF NOT EXISTS microsoft_tenant_id text;
