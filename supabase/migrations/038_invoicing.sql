-- Invoicing: one-off + recurring invoices, branded public payment page.
-- Mirrors the quoting patterns (public_token, Stripe checkout, branding from
-- support_settings). Recurring schedules are generated daily by pg_cron via
-- the invoice-recurring edge function.

CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1000;

CREATE TABLE IF NOT EXISTS public.invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  integer NOT NULL DEFAULT nextval('public.invoice_number_seq'),
  company_id      uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  location_id     uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  contact_id      uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  recurring_id    uuid,                                  -- schedule that generated this (FK added below)
  status          text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','viewed','paid','void')),
  issue_date      date NOT NULL DEFAULT current_date,
  due_date        date,
  tax_rate        numeric NOT NULL DEFAULT 20,
  subtotal        numeric NOT NULL DEFAULT 0,
  tax_amount      numeric NOT NULL DEFAULT 0,
  total           numeric NOT NULL DEFAULT 0,
  terms           text,
  notes           text,
  email_to        text,
  public_token    text UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  sent_at         timestamptz,
  paid_at         timestamptz,
  amount_paid     numeric,
  stripe_checkout_id text,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_company ON public.invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_location ON public.invoices(location_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contact ON public.invoices(contact_id);
CREATE INDEX IF NOT EXISTS idx_invoices_token ON public.invoices(public_token);

CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  qty         numeric NOT NULL DEFAULT 1,
  unit_price  numeric NOT NULL DEFAULT 0,
  sort        integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invoice_lines ON public.invoice_line_items(invoice_id);

CREATE TABLE IF NOT EXISTS public.recurring_invoices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label        text,
  company_id   uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  location_id  uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  contact_id   uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  email_to     text,
  frequency    text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly','quarterly','annual')),
  day_of_month integer NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 28),
  next_run     date NOT NULL DEFAULT current_date,
  due_days     integer NOT NULL DEFAULT 14,
  tax_rate     numeric NOT NULL DEFAULT 20,
  lines        jsonb NOT NULL DEFAULT '[]',              -- [{name, description, qty, unit_price}]
  terms        text,
  notes        text,
  auto_send    boolean NOT NULL DEFAULT true,
  active       boolean NOT NULL DEFAULT true,
  last_run_at  timestamptz,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_next ON public.recurring_invoices(next_run) WHERE active;

DO $$ BEGIN
  ALTER TABLE public.invoices
    ADD CONSTRAINT invoices_recurring_fk FOREIGN KEY (recurring_id)
    REFERENCES public.recurring_invoices(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Global default terms for invoices (branding fields already exist for quotes)
ALTER TABLE public.support_settings ADD COLUMN IF NOT EXISTS invoice_terms text;

-- RLS: signed-in read; editors/owners write
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoices','invoice_line_items','recurring_invoices'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_read ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format($f$CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated
      USING (public.current_user_role() IN ('editor','owner'))
      WITH CHECK (public.current_user_role() IN ('editor','owner'))$f$, t, t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_invoices_touch ON public.invoices;
CREATE TRIGGER trg_invoices_touch BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_recurring_invoices_touch ON public.recurring_invoices;
CREATE TRIGGER trg_recurring_invoices_touch BEFORE UPDATE ON public.recurring_invoices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Daily generator: run recurring schedules at 06:00 UTC. invoice-recurring is
-- deployed --no-verify-jwt (service role internally); repeat calls are no-ops
-- because next_run advances after generation.
DO $$ BEGIN
  PERFORM cron.unschedule('invoice-recurring-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'invoice-recurring-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://yuevuqvldtmjwwzjrddo.supabase.co/functions/v1/invoice-recurring',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
