-- Staged / progress billing: deposit + milestone stages, per-stage invoices,
-- card-on-file (Stripe Customer + saved payment method), off-session charging,
-- webhook idempotency, and a charge audit log.

-- Payment schedule: a deposit + N named milestone stages on a quote.
CREATE TABLE IF NOT EXISTS public.payment_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort int NOT NULL DEFAULT 0,
  basis text NOT NULL DEFAULT 'percent' CHECK (basis IN ('percent','fixed')),
  percent numeric NOT NULL DEFAULT 0,           -- when basis='percent'
  amount numeric NOT NULL DEFAULT 0,            -- resolved $ amount (computed at save/sign)
  is_deposit boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','invoiced','charging','paid','failed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_stages_quote ON public.payment_stages(quote_id);

-- Invoices know their stage and can hold the off-session PaymentIntent.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.payment_stages(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS stripe_payment_intent text;

-- Card-on-file: a Stripe Customer per contact (reusable), and the saved card
-- captured for THIS contract held on the quote (unambiguous per-contract billing).
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS stripe_payment_method_id text;

-- Webhook idempotency — Stripe retries events; never process one twice (no double-charge).
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id text PRIMARY KEY,                  -- Stripe event id (evt_...)
  type text,
  created_at timestamptz DEFAULT now()
);

-- Audit trail for every staff-triggered card charge.
CREATE TABLE IF NOT EXISTS public.stage_charge_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid REFERENCES public.payment_stages(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  charged_by uuid,
  amount numeric,
  currency text DEFAULT 'usd',
  stripe_payment_intent text,
  outcome text,                          -- succeeded | failed | requires_action
  error text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.payment_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_stages_read ON public.payment_stages;
DROP POLICY IF EXISTS payment_stages_write ON public.payment_stages;
CREATE POLICY payment_stages_read ON public.payment_stages FOR SELECT TO authenticated USING (true);
-- Writes (the payment schedule = money) gated to staff, matching invoices/quotes.
CREATE POLICY payment_stages_write ON public.payment_stages FOR ALL TO authenticated
  USING (current_user_role() = ANY (ARRAY['editor','owner']))
  WITH CHECK (current_user_role() = ANY (ARRAY['editor','owner']));

ALTER TABLE public.stage_charge_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stage_charge_log_read ON public.stage_charge_log;
CREATE POLICY stage_charge_log_read ON public.stage_charge_log FOR SELECT TO authenticated USING (true);

-- stripe_events: written only by the webhook (service_role, bypasses RLS).
-- RLS on with no authenticated policy = invisible/untouchable to app users.
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
