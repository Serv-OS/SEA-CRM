-- 000_drift_prelude.sql : bare drifted tables + PK/unique/check (before migrations reference them)
create table if not exists public.agent_status (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  status text not null default 'offline'::text,
  twilio_identity text,
  last_seen_at timestamp with time zone not null default now(),
  current_call_sid text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.gmail_connections (
  id uuid not null default gen_random_uuid(),
  email text not null,
  access_token text,
  refresh_token text not null,
  token_expires_at timestamp with time zone,
  connected_by uuid,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  last_polled_at timestamp with time zone
);

create table if not exists public.leads (
  id uuid not null default gen_random_uuid(),
  name text not null,
  stage text not null default 'new_lead'::text,
  source text,
  company_id uuid,
  location_id uuid,
  contact_id uuid,
  deal_id uuid,
  owner_id uuid,
  venue_type text,
  covers integer,
  current_pos text,
  pain_points text,
  notes text,
  disqualified_reason text,
  priority text default 'medium'::text,
  next_action text,
  next_action_date date,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.quote_config (
  id integer not null default 1,
  markup_default numeric not null default 1.6,
  permits_per_sqft numeric not null default 0.96,
  debris_per_sqft numeric not null default 2,
  install_mat_divisor numeric not null default 1000,
  currency text not null default 'USD'::text,
  updated_at timestamp with time zone default now()
);

create table if not exists public.quote_config_demo_rates (
  id uuid not null default gen_random_uuid(),
  label text not null,
  rate_per_sqft numeric not null default 0,
  sort integer not null default 0,
  active boolean not null default true
);

create table if not exists public.quote_config_install_materials (
  id uuid not null default gen_random_uuid(),
  name text not null,
  cost numeric not null default 0,
  mult numeric not null default 1,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.quote_config_products (
  id uuid not null default gen_random_uuid(),
  name text not null,
  type text not null default 'sqft'::text,
  unit_cost numeric not null default 0,
  install_rate numeric not null default 0,
  unit_label text,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.quote_estimates (
  id uuid not null default gen_random_uuid(),
  quote_id uuid,
  total_sqft numeric default 0,
  num_stories numeric default 0,
  demo_type text,
  markup numeric default 1.6,
  inputs jsonb default '{}'::jsonb,
  siding_material numeric default 0,
  siding_install numeric default 0,
  install_mat_sum numeric default 0,
  demo_cost numeric default 0,
  permits_cost numeric default 0,
  debris_cost numeric default 0,
  total_cost numeric default 0,
  sale_price numeric default 0,
  profit numeric default 0,
  margin numeric default 0,
  breakdown jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);


-- primary/unique/check constraints (self-contained)
alter table public.agent_status add constraint agent_status_pkey PRIMARY KEY (id);
alter table public.gmail_connections add constraint gmail_connections_pkey PRIMARY KEY (id);
alter table public.leads add constraint leads_pkey PRIMARY KEY (id);
alter table public.quote_config add constraint quote_config_pkey PRIMARY KEY (id);
alter table public.quote_config_demo_rates add constraint quote_config_demo_rates_pkey PRIMARY KEY (id);
alter table public.quote_config_install_materials add constraint quote_config_install_materials_pkey PRIMARY KEY (id);
alter table public.quote_config_products add constraint quote_config_products_pkey PRIMARY KEY (id);
alter table public.quote_estimates add constraint quote_estimates_pkey PRIMARY KEY (id);
alter table public.agent_status add constraint agent_status_profile_id_key UNIQUE (profile_id);
alter table public.agent_status add constraint agent_status_status_check CHECK ((status = ANY (ARRAY['online'::text, 'offline'::text, 'busy'::text, 'away'::text])));
alter table public.leads add constraint leads_priority_check CHECK ((priority = ANY (ARRAY['hot'::text, 'warm'::text, 'medium'::text, 'cold'::text])));
alter table public.leads add constraint leads_stage_check CHECK ((stage = ANY (ARRAY['new_lead'::text, 'attempting'::text, 'contacted'::text, 'qualified'::text, 'disqualified'::text])));
alter table public.quote_config add constraint quote_config_singleton CHECK ((id = 1));
alter table public.quote_config_products add constraint quote_config_products_type_check CHECK ((type = ANY (ARRAY['sqft'::text, 'batten'::text, 'length'::text])));
