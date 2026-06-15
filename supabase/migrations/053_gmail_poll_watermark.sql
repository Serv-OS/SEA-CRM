-- Poll watermark: only mail arriving AFTER the mailbox was connected becomes a
-- ticket. Replaces the fragile is:unread filter (a shared mailbox humans also
-- read would otherwise lose unread state and miss messages). Dedup by Gmail
-- message-id is the backstop against any overlap.
ALTER TABLE public.gmail_connections ADD COLUMN IF NOT EXISTS last_polled_at timestamptz;
-- Existing connections start watermark "now" so we don't import their history.
UPDATE public.gmail_connections SET last_polled_at = now() WHERE last_polled_at IS NULL;
