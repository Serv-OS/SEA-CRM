-- 083_agreement_payment_details.sql (ADDITIVE, safe to run twice)
--
-- Peter, 10 Nov 2026: payment details are typed once, in Settings, and are on
-- every agreement. An agreement can still change its own copy.
alter table public.support_settings
  add column if not exists agreement_payment_details text;
comment on column public.support_settings.agreement_payment_details is
  'Default check / bank / Zelle details shown on every stage agreement (agreements.payment_details overrides).';

-- ROLLBACK
--   alter table public.support_settings drop column agreement_payment_details;
