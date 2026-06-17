-- 063_twilio_number_rental.sql
-- Per-number billing meters usage from the Calls/Messages APIs (filtered by the
-- number), but the monthly number rental isn't exposed there — so it's a config
-- value on the support_settings singleton. Default $1.15 (US local number).
ALTER TABLE public.support_settings
  ADD COLUMN IF NOT EXISTS twilio_number_rental numeric DEFAULT 1.15;
