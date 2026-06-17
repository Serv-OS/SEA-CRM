-- 061_build_stage_dates.sql
-- Construction timeline dates on the build-stage record (the "Install Dates" card).
-- Adds hardware delivery + demo/install start, and an expected-completion date
-- (the UI replaces the old "Actual install" field; actual_install_date stays
--  dormant rather than being re-purposed under a misleading name).
ALTER TABLE public.onboardings
  ADD COLUMN IF NOT EXISTS hardware_delivery_date   date,
  ADD COLUMN IF NOT EXISTS demo_install_start_date  date,
  ADD COLUMN IF NOT EXISTS expected_completion_date date;
