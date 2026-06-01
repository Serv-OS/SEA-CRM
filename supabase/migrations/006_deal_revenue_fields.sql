-- v0.6: Add revenue breakdown fields to deals
-- Additive only. No data loss. Safe to re-run.

-- Hardware is a one-time cost
DO $$ BEGIN
  ALTER TABLE public.deals ADD COLUMN hardware_value numeric(12,2);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Services is a one-time cost (installation, training, etc.)
DO $$ BEGIN
  ALTER TABLE public.deals ADD COLUMN services_value numeric(12,2);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- SaaS ARR (annual recurring revenue for the software subscription)
DO $$ BEGIN
  ALTER TABLE public.deals ADD COLUMN saas_arr numeric(12,2);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Payments ARR (annual recurring revenue from payment processing)
DO $$ BEGIN
  ALTER TABLE public.deals ADD COLUMN payments_arr numeric(12,2);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Verify
SELECT 'hardware_value' AS col, EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_name='deals' AND column_name='hardware_value'
) AS ok
UNION ALL SELECT 'services_value', EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_name='deals' AND column_name='services_value'
)
UNION ALL SELECT 'saas_arr', EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_name='deals' AND column_name='saas_arr'
)
UNION ALL SELECT 'payments_arr', EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_name='deals' AND column_name='payments_arr'
);
