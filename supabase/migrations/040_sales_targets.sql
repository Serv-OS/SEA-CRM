-- Configurable sales targets used by the Sales Performance report.
-- Defaults are the CEO-defined goals (quota incl. payments ARR, 10% commission).
ALTER TABLE public.support_settings ADD COLUMN IF NOT EXISTS sales_targets jsonb;
UPDATE public.support_settings SET sales_targets =
  '{"activities_per_day":40,"activities_per_week":200,"meetings_per_week":8,"quota_arr_month":48000,"commission_pct":10}'::jsonb
  WHERE id = 1 AND sales_targets IS NULL;
