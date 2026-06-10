-- Per-instance Twilio support number (UI was previously hardcoded to the dev number)
ALTER TABLE public.support_settings ADD COLUMN IF NOT EXISTS twilio_number text;
-- Preserve the number already in service on the original instance
UPDATE public.support_settings SET twilio_number = '+44 7576 562085'
  WHERE id = 1 AND twilio_number IS NULL AND business_name IS DISTINCT FROM 'POSUP';
