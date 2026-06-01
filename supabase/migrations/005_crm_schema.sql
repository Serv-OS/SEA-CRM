-- ============================================================================
-- ServOS CRM Schema -- Phase 0
-- Pivots Posupject from bug/feature kanban into ServOS B2B CRM.
-- Extends existing stack. Migrates existing kanban into backlog_items.
-- Safe to review before applying. STOP: do not apply until approved.
-- ============================================================================

-- ============================================================================
-- PART 1: RENAME EXISTING TABLES FOR BACKLOG MODULE
-- The existing kanban tables become the Product Backlog module.
-- ============================================================================

-- Rename existing projects -> backlog_projects (these are kanban boards)
ALTER TABLE public.projects RENAME TO backlog_projects;
ALTER TABLE public.buckets RENAME COLUMN project_id TO backlog_project_id;
ALTER INDEX IF EXISTS idx_buckets_project RENAME TO idx_buckets_backlog_project;

-- Rename existing items -> backlog_items
ALTER TABLE public.items RENAME TO backlog_items;
ALTER TABLE public.backlog_items RENAME COLUMN project_id TO backlog_project_id;
ALTER INDEX IF EXISTS idx_items_project RENAME TO idx_backlog_items_project;
ALTER INDEX IF EXISTS idx_items_bucket RENAME TO idx_backlog_items_bucket;
ALTER INDEX IF EXISTS idx_items_assignee RENAME TO idx_backlog_items_assignee;
ALTER INDEX IF EXISTS idx_items_feature RENAME TO idx_backlog_items_feature;

-- Rename existing comments (item_id stays, referencing backlog_items)
-- No rename needed, just update FK reference name
-- comments.item_id already references items(id) which is now backlog_items(id)

-- Rename existing activity references
-- activity.item_id already references items(id) which is now backlog_items(id)
-- activity.project_id references projects(id) which is now backlog_projects(id)
ALTER TABLE public.activity RENAME COLUMN project_id TO backlog_project_id;

-- Update realtime publication (drop old, add renamed)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.items;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.buckets;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.backlog_items;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.buckets;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add new columns to backlog_items for release tracking
DO $$ BEGIN
  ALTER TABLE public.backlog_items ADD COLUMN target_release_id uuid;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.backlog_items ADD COLUMN released_in_release_id uuid;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ============================================================================
-- PART 2: CORE CRM OBJECTS
-- ============================================================================

-- ── Companies ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.companies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  name              text NOT NULL,
  domain            text,
  phone             text,
  email             text,
  website           text,
  address           text,
  city              text,
  postcode          text,
  country           text DEFAULT 'GB',
  industry          text,
  employee_count    integer,
  notes             text,
  source            text,
  owner_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_companies_parent ON public.companies(parent_company_id);
CREATE INDEX IF NOT EXISTS idx_companies_owner ON public.companies(owner_id);
CREATE INDEX IF NOT EXISTS idx_companies_name ON public.companies(name);

-- ── Locations ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.locations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name          text NOT NULL,
  address       text,
  city          text,
  postcode      text,
  country       text DEFAULT 'GB',
  phone         text,
  email         text,
  venue_type    text, -- restaurant, bar, cafe, hotel, etc.
  covers        integer, -- seating capacity
  notes         text,
  status        text NOT NULL DEFAULT 'prospect'
    CHECK (status IN ('prospect','onboarding','live','churned')),
  go_live_date  date,
  owner_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_locations_company ON public.locations(company_id);
CREATE INDEX IF NOT EXISTS idx_locations_status ON public.locations(status);

-- ── Contacts ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text,
  phone         text,
  first_name    text,
  last_name     text,
  job_title     text,
  notes         text,
  source        text,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  gdpr_consent_at  timestamptz,
  owner_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON public.contacts(last_name, first_name);

-- ── Role lookup (extensible without migrations) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.association_roles (
  role  text PRIMARY KEY,
  label text NOT NULL,
  sort  integer NOT NULL DEFAULT 0
);
INSERT INTO public.association_roles (role, label, sort) VALUES
  ('owner', 'Owner', 1),
  ('manager', 'Manager', 2),
  ('billing_contact', 'Billing Contact', 3),
  ('staff_member', 'Staff Member', 4),
  ('primary_contact', 'Primary Contact', 0)
ON CONFLICT (role) DO NOTHING;

-- ── Polymorphic associations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.associations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_type  text NOT NULL,
  from_id    uuid NOT NULL,
  to_type    text NOT NULL,
  to_id      uuid NOT NULL,
  label      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assoc_from ON public.associations(from_type, from_id);
CREATE INDEX IF NOT EXISTS idx_assoc_to ON public.associations(to_type, to_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_assoc_unique
  ON public.associations(from_type, from_id, to_type, to_id, label);

-- ── Deals ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name          text NOT NULL,
  stage         text NOT NULL DEFAULT 'new_lead'
    CHECK (stage IN (
      'new_lead','contacted','qualified','demo_booked','demo_done',
      'proposal_sent','negotiation','closed_won','closed_lost'
    )),
  value         numeric(12,2),
  currency      text NOT NULL DEFAULT 'GBP',
  expected_close_date date,
  lost_reason   text,
  source        text,
  notes         text,
  owner_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  closed_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_deals_company ON public.deals(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON public.deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_owner ON public.deals(owner_id);

-- ── Onboardings ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.onboardings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  deal_id       uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  stage         text NOT NULL DEFAULT 'kickoff'
    CHECK (stage IN (
      'kickoff','hardware_ordered','hardware_shipped','account_menu_config',
      'staff_training','go_live_scheduled','live','handover_to_support'
    )),
  notes         text,
  owner_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onboardings_company ON public.onboardings(company_id);
CREATE INDEX IF NOT EXISTS idx_onboardings_stage ON public.onboardings(stage);

-- ── Tickets ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tickets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subject       text NOT NULL,
  description   text,
  stage         text NOT NULL DEFAULT 'new'
    CHECK (stage IN (
      'new','in_progress','waiting_on_customer','escalated','resolved','closed'
    )),
  priority      text NOT NULL DEFAULT 'P2'
    CHECK (priority IN ('P0','P1','P2','P3')),
  ticket_type   text DEFAULT 'support'
    CHECK (ticket_type IN ('support','bug','feature_request','billing','other')),
  source        text,
  notes         text,
  owner_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz,
  closed_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_tickets_company ON public.tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_stage ON public.tickets(stage);
CREATE INDEX IF NOT EXISTS idx_tickets_owner ON public.tickets(owner_id);

-- ============================================================================
-- PART 3: ACTIVITIES (unified engagement log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crm_activities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL
    CHECK (type IN ('call','email','sms','note','meeting','whatsapp')),
  subject       text,
  body          text,
  subject_type  text NOT NULL, -- 'company','location','contact','deal','onboarding','ticket'
  subject_id    uuid NOT NULL,
  direction     text CHECK (direction IN ('inbound','outbound')),
  contact_id    uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  actor_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_activities_subject ON public.crm_activities(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_contact ON public.crm_activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_actor ON public.crm_activities(actor_id);

-- ============================================================================
-- PART 4: TASKS, PROJECTS, TEMPLATES
-- ============================================================================

-- ── CRM Projects (task containers, not kanban boards) ───────────────────────
CREATE TABLE IF NOT EXISTS public.crm_projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text,
  status        text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','cancelled')),
  subject_type  text, -- 'deal','onboarding','company','location','ticket'
  subject_id    uuid,
  template_id   uuid, -- which template spawned this, if any
  owner_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date      date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_projects_subject ON public.crm_projects(subject_type, subject_id);

-- ── Tasks ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  description     text,
  status          text NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo','in_progress','blocked','done')),
  priority        text NOT NULL DEFAULT 'P2'
    CHECK (priority IN ('P0','P1','P2','P3')),
  parent_task_id  uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES public.crm_projects(id) ON DELETE CASCADE,
  subject_type    text, -- polymorphic: 'deal','onboarding','company','location','ticket'
  subject_id      uuid,
  owner_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date        date,
  completed_at    timestamptz,
  sort_order      integer NOT NULL DEFAULT 0,
  depends_on_id   uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  is_recurring    boolean NOT NULL DEFAULT false,
  recurrence_rule text, -- e.g. 'every_3_days', 'weekly_monday'
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON public.tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_subject ON public.tasks(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_tasks_owner ON public.tasks(owner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON public.tasks(due_date) WHERE status != 'done';

-- ── Project templates ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Task templates ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_templates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_template_id uuid NOT NULL REFERENCES public.project_templates(id) ON DELETE CASCADE,
  title               text NOT NULL,
  description         text,
  priority            text NOT NULL DEFAULT 'P2'
    CHECK (priority IN ('P0','P1','P2','P3')),
  parent_template_id  uuid REFERENCES public.task_templates(id) ON DELETE CASCADE,
  due_offset_days     integer DEFAULT 0, -- relative to trigger date
  default_assignee_role text, -- e.g. 'owner' means assign to the onboarding owner
  sort_order          integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_task_templates_project ON public.task_templates(project_template_id);

-- ── Automations (trigger -> template) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  event           text NOT NULL, -- 'deal_closed_won','location_enters_onboarding','module_enabled','ticket_created'
  condition       jsonb DEFAULT '{}', -- optional filter, e.g. {"ticket_type":"bug"}
  template_id     uuid NOT NULL REFERENCES public.project_templates(id) ON DELETE CASCADE,
  enabled         boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automations_event ON public.automations(event) WHERE enabled = true;

-- ============================================================================
-- PART 5: MODULES
-- ============================================================================

-- ── Module catalogue ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.modules (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL UNIQUE,
  description           text,
  icon                  text,
  sort_order            integer NOT NULL DEFAULT 0,
  onboarding_template_id uuid REFERENCES public.project_templates(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Seed the ServOS POS module catalogue
INSERT INTO public.modules (name, description, sort_order) VALUES
  ('POS Core',          'Core point-of-sale terminal',                1),
  ('Floor Plan & Tables','Table management and floor layout',         2),
  ('Bar Tabs',          'Open and manage bar tabs',                   3),
  ('Kitchen Display',   'Kitchen display system (KDS)',               4),
  ('Orders',            'Order management and routing',               5),
  ('Cash Management',   'Cash drawer and end-of-day reconciliation',  6),
  ('Diner CRM',         'Customer profiles, loyalty, and engagement', 7),
  ('Reservations',      'Table booking and reservation management',   8),
  ('Allergens',         'Allergen tracking and declarations',         9),
  ('Payments (Stripe)', 'Card payments via Stripe integration',      10),
  ('Delivery (Deliverect)', 'Delivery aggregator integration',       11),
  ('Staff Management',  'Staff scheduling, roles, and permissions',  12),
  ('Fiscal Reports',    'Financial reporting and compliance',        13),
  ('AI Agents',         'AI-powered automation and insights',        14)
ON CONFLICT (name) DO NOTHING;

-- ── Location modules (which modules each location has) ──────────────────────
CREATE TABLE IF NOT EXISTS public.location_modules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  module_id     uuid NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'quoted'
    CHECK (status IN ('quoted','included','enabling','live','disabled')),
  enabled_at    timestamptz,
  disabled_at   timestamptz,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, module_id)
);
CREATE INDEX IF NOT EXISTS idx_location_modules_location ON public.location_modules(location_id);
CREATE INDEX IF NOT EXISTS idx_location_modules_module ON public.location_modules(module_id);

-- ============================================================================
-- PART 6: FEATURE REQUESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.feature_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  description     text,
  status          text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','under_review','planned','in_progress','shipped','declined')),
  priority        text NOT NULL DEFAULT 'P2'
    CHECK (priority IN ('P0','P1','P2','P3')),
  requested_by    uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  backlog_item_id uuid REFERENCES public.backlog_items(id) ON DELETE SET NULL,
  owner_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feature_requests_status ON public.feature_requests(status);
CREATE INDEX IF NOT EXISTS idx_feature_requests_backlog ON public.feature_requests(backlog_item_id);

-- ============================================================================
-- PART 7: RELEASES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.releases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product       text NOT NULL DEFAULT 'pos'
    CHECK (product IN ('pos','crm')),
  version       text NOT NULL,
  name          text,
  status        text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','in_dev','released')),
  released_at   timestamptz,
  changelog     text, -- derived/edited changelog
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product, version)
);
CREATE INDEX IF NOT EXISTS idx_releases_status ON public.releases(status);

-- Add release FK to backlog_items (columns added in Part 1, now add FKs)
DO $$ BEGIN
  ALTER TABLE public.backlog_items
    ADD CONSTRAINT backlog_items_target_release_fkey
    FOREIGN KEY (target_release_id) REFERENCES public.releases(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.backlog_items
    ADD CONSTRAINT backlog_items_released_in_release_fkey
    FOREIGN KEY (released_in_release_id) REFERENCES public.releases(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- PART 8: STAGE HISTORY (mandatory for reporting)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stage_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type   text NOT NULL, -- 'deal','onboarding','ticket'
  object_id     uuid NOT NULL,
  from_stage    text,
  to_stage      text NOT NULL,
  changed_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stage_history_object ON public.stage_history(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_stage_history_changed ON public.stage_history(changed_at);

-- ============================================================================
-- PART 9: COMPANY SUBTREE RECURSIVE VIEW
-- ============================================================================

-- Returns the full descendant set for any company_id (inclusive).
-- Usage: SELECT * FROM company_subtree('some-uuid');
CREATE OR REPLACE FUNCTION public.company_subtree(root_id uuid)
RETURNS TABLE (id uuid, depth integer) AS $$
  WITH RECURSIVE tree AS (
    SELECT c.id, 0 AS depth
    FROM public.companies c
    WHERE c.id = root_id
    UNION ALL
    SELECT c.id, t.depth + 1
    FROM public.companies c
    JOIN tree t ON c.parent_company_id = t.id
  )
  SELECT * FROM tree;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================================
-- PART 10: UPDATED_AT TRIGGERS
-- ============================================================================

-- Reuse existing touch_updated_at function from 001_init
DO $$ BEGIN
  CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger AS $fn$
  BEGIN NEW.updated_at = now(); RETURN NEW; END;
  $fn$ LANGUAGE plpgsql;
EXCEPTION WHEN duplicate_function THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_companies_touch ON public.companies;
CREATE TRIGGER trg_companies_touch BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_locations_touch ON public.locations;
CREATE TRIGGER trg_locations_touch BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_contacts_touch ON public.contacts;
CREATE TRIGGER trg_contacts_touch BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_deals_touch ON public.deals;
CREATE TRIGGER trg_deals_touch BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_onboardings_touch ON public.onboardings;
CREATE TRIGGER trg_onboardings_touch BEFORE UPDATE ON public.onboardings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_tickets_touch ON public.tickets;
CREATE TRIGGER trg_tickets_touch BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_crm_projects_touch ON public.crm_projects;
CREATE TRIGGER trg_crm_projects_touch BEFORE UPDATE ON public.crm_projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_tasks_touch ON public.tasks;
CREATE TRIGGER trg_tasks_touch BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_feature_requests_touch ON public.feature_requests;
CREATE TRIGGER trg_feature_requests_touch BEFORE UPDATE ON public.feature_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_releases_touch ON public.releases;
CREATE TRIGGER trg_releases_touch BEFORE UPDATE ON public.releases
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_location_modules_touch ON public.location_modules;
CREATE TRIGGER trg_location_modules_touch BEFORE UPDATE ON public.location_modules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================================
-- PART 11: ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.companies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.associations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.association_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboardings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_projects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_modules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.releases          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_history     ENABLE ROW LEVEL SECURITY;

-- Same pattern as existing: all authenticated read, editor/owner write
-- Using a macro to avoid repetition

-- Read policies (all authenticated users)
DO $$ BEGIN CREATE POLICY companies_read ON public.companies FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY locations_read ON public.locations FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY contacts_read ON public.contacts FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY associations_read ON public.associations FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY association_roles_read ON public.association_roles FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY deals_read ON public.deals FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY onboardings_read ON public.onboardings FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY tickets_read ON public.tickets FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY crm_activities_read ON public.crm_activities FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY crm_projects_read ON public.crm_projects FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY tasks_read ON public.tasks FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY project_templates_read ON public.project_templates FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY task_templates_read ON public.task_templates FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY automations_read ON public.automations FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY modules_read ON public.modules FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY location_modules_read ON public.location_modules FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY feature_requests_read ON public.feature_requests FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY releases_read ON public.releases FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY stage_history_read ON public.stage_history FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Write policies (editor/owner)
DO $$ BEGIN CREATE POLICY companies_write ON public.companies FOR ALL TO authenticated USING (public.current_user_role() IN ('editor','owner')) WITH CHECK (public.current_user_role() IN ('editor','owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY locations_write ON public.locations FOR ALL TO authenticated USING (public.current_user_role() IN ('editor','owner')) WITH CHECK (public.current_user_role() IN ('editor','owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY contacts_write ON public.contacts FOR ALL TO authenticated USING (public.current_user_role() IN ('editor','owner')) WITH CHECK (public.current_user_role() IN ('editor','owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY associations_write ON public.associations FOR ALL TO authenticated USING (public.current_user_role() IN ('editor','owner')) WITH CHECK (public.current_user_role() IN ('editor','owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY association_roles_write ON public.association_roles FOR ALL TO authenticated USING (public.current_user_role() = 'owner') WITH CHECK (public.current_user_role() = 'owner'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY deals_write ON public.deals FOR ALL TO authenticated USING (public.current_user_role() IN ('editor','owner')) WITH CHECK (public.current_user_role() IN ('editor','owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY onboardings_write ON public.onboardings FOR ALL TO authenticated USING (public.current_user_role() IN ('editor','owner')) WITH CHECK (public.current_user_role() IN ('editor','owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY tickets_write ON public.tickets FOR ALL TO authenticated USING (public.current_user_role() IN ('editor','owner')) WITH CHECK (public.current_user_role() IN ('editor','owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY crm_activities_write ON public.crm_activities FOR ALL TO authenticated USING (public.current_user_role() IN ('editor','owner')) WITH CHECK (public.current_user_role() IN ('editor','owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY crm_projects_write ON public.crm_projects FOR ALL TO authenticated USING (public.current_user_role() IN ('editor','owner')) WITH CHECK (public.current_user_role() IN ('editor','owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY tasks_write ON public.tasks FOR ALL TO authenticated USING (public.current_user_role() IN ('editor','owner')) WITH CHECK (public.current_user_role() IN ('editor','owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY project_templates_write ON public.project_templates FOR ALL TO authenticated USING (public.current_user_role() = 'owner') WITH CHECK (public.current_user_role() = 'owner'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY task_templates_write ON public.task_templates FOR ALL TO authenticated USING (public.current_user_role() = 'owner') WITH CHECK (public.current_user_role() = 'owner'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY automations_write ON public.automations FOR ALL TO authenticated USING (public.current_user_role() = 'owner') WITH CHECK (public.current_user_role() = 'owner'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY modules_write ON public.modules FOR ALL TO authenticated USING (public.current_user_role() = 'owner') WITH CHECK (public.current_user_role() = 'owner'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY location_modules_write ON public.location_modules FOR ALL TO authenticated USING (public.current_user_role() IN ('editor','owner')) WITH CHECK (public.current_user_role() IN ('editor','owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY feature_requests_write ON public.feature_requests FOR ALL TO authenticated USING (public.current_user_role() IN ('editor','owner')) WITH CHECK (public.current_user_role() IN ('editor','owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY releases_write ON public.releases FOR ALL TO authenticated USING (public.current_user_role() IN ('editor','owner')) WITH CHECK (public.current_user_role() IN ('editor','owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY stage_history_insert ON public.stage_history FOR INSERT TO authenticated WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- PART 12: REALTIME
-- ============================================================================

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.companies; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.locations; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.deals; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.onboardings; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- PART 13: VERIFY
-- ============================================================================

SELECT 'companies' AS tbl, EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='companies') AS ok
UNION ALL SELECT 'locations', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='locations')
UNION ALL SELECT 'contacts', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='contacts')
UNION ALL SELECT 'associations', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='associations')
UNION ALL SELECT 'deals', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='deals')
UNION ALL SELECT 'onboardings', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='onboardings')
UNION ALL SELECT 'tickets', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tickets')
UNION ALL SELECT 'crm_activities', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='crm_activities')
UNION ALL SELECT 'crm_projects', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='crm_projects')
UNION ALL SELECT 'tasks', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tasks')
UNION ALL SELECT 'project_templates', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='project_templates')
UNION ALL SELECT 'task_templates', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='task_templates')
UNION ALL SELECT 'automations', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='automations')
UNION ALL SELECT 'modules', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='modules')
UNION ALL SELECT 'location_modules', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='location_modules')
UNION ALL SELECT 'feature_requests', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='feature_requests')
UNION ALL SELECT 'releases', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='releases')
UNION ALL SELECT 'stage_history', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='stage_history')
UNION ALL SELECT 'backlog_items (renamed)', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='backlog_items')
UNION ALL SELECT 'backlog_projects (renamed)', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='backlog_projects')
UNION ALL SELECT 'association_roles', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='association_roles')
UNION ALL SELECT 'company_subtree fn', EXISTS (SELECT 1 FROM pg_proc WHERE proname='company_subtree');
