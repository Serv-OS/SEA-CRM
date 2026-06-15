-- Per-user Google Chat DM channel (private 1:1 from the CRM app), alongside
-- email + sms. Off by default; the app DMs the user for their own alerts.
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS chat_dm_enabled boolean DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS chat_dm_at timestamptz;
