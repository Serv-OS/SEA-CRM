-- Per-instance Twilio support number (UI was previously hardcoded to the dev number).
-- No backfill: each instance sets its own number in Settings. (The original dev
-- instance was backfilled manually with its existing number.)
ALTER TABLE public.support_settings ADD COLUMN IF NOT EXISTS twilio_number text;
