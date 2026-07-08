-- 900_drift_finalize.sql : FKs + indexes + rls + grants + policies + triggers + realtime (after migrations)
alter table public.agent_status add constraint agent_status_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.gmail_connections add constraint gmail_connections_connected_by_fkey FOREIGN KEY (connected_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.leads add constraint leads_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
alter table public.leads add constraint leads_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
alter table public.leads add constraint leads_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;
alter table public.leads add constraint leads_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
alter table public.leads add constraint leads_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.quote_estimates add constraint quote_estimates_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE;

CREATE INDEX idx_agent_status_online ON public.agent_status USING btree (status) WHERE (status = 'online'::text);
CREATE INDEX idx_leads_company ON public.leads USING btree (company_id);
CREATE INDEX idx_leads_contact ON public.leads USING btree (contact_id);
CREATE INDEX idx_leads_owner ON public.leads USING btree (owner_id);
CREATE INDEX idx_leads_stage ON public.leads USING btree (stage);
CREATE INDEX idx_quote_estimates_quote ON public.quote_estimates USING btree (quote_id);

alter table public.agent_status enable row level security;
grant all on public.agent_status to anon, authenticated, service_role;
alter table public.gmail_connections enable row level security;
grant all on public.gmail_connections to anon, authenticated, service_role;
alter table public.leads enable row level security;
grant all on public.leads to anon, authenticated, service_role;
alter table public.quote_config enable row level security;
grant all on public.quote_config to anon, authenticated, service_role;
alter table public.quote_config_demo_rates enable row level security;
grant all on public.quote_config_demo_rates to anon, authenticated, service_role;
alter table public.quote_config_install_materials enable row level security;
grant all on public.quote_config_install_materials to anon, authenticated, service_role;
alter table public.quote_config_products enable row level security;
grant all on public.quote_config_products to anon, authenticated, service_role;
alter table public.quote_estimates enable row level security;
grant all on public.quote_estimates to anon, authenticated, service_role;

create policy agent_status_read on public.agent_status as permissive for select to authenticated using (true);
create policy agent_status_write on public.agent_status as permissive for all to authenticated using (((profile_id = auth.uid()) OR (current_user_role() = 'owner'::text))) with check (((profile_id = auth.uid()) OR (current_user_role() = 'owner'::text)));
create policy gmail_conn_read on public.gmail_connections as permissive for select to authenticated using (true);
create policy gmail_conn_write on public.gmail_connections as permissive for all to authenticated using ((current_user_role() = 'owner'::text)) with check ((current_user_role() = 'owner'::text));
create policy leads_read on public.leads as permissive for select to authenticated using (true);
create policy leads_write on public.leads as permissive for all to authenticated using ((current_user_role() = ANY (ARRAY['editor'::text, 'owner'::text]))) with check ((current_user_role() = ANY (ARRAY['editor'::text, 'owner'::text])));
create policy quote_config_read on public.quote_config as permissive for select to authenticated using (true);
create policy quote_config_write on public.quote_config as permissive for all to authenticated using (true) with check (true);
create policy quote_config_demo_rates_read on public.quote_config_demo_rates as permissive for select to authenticated using (true);
create policy quote_config_demo_rates_write on public.quote_config_demo_rates as permissive for all to authenticated using (true) with check (true);
create policy quote_config_install_materials_read on public.quote_config_install_materials as permissive for select to authenticated using (true);
create policy quote_config_install_materials_write on public.quote_config_install_materials as permissive for all to authenticated using (true) with check (true);
create policy quote_config_products_read on public.quote_config_products as permissive for select to authenticated using (true);
create policy quote_config_products_write on public.quote_config_products as permissive for all to authenticated using (true) with check (true);
create policy quote_estimates_read on public.quote_estimates as permissive for select to authenticated using (true);
create policy quote_estimates_write on public.quote_estimates as permissive for all to authenticated using (true) with check (true);

CREATE TRIGGER trg_leads_touch BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

do $$ begin alter publication supabase_realtime add table public.agent_status; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.leads; exception when duplicate_object then null; end $$;


-- dormant RLS auto-enable helper (parity with psc-crm; no event trigger wired)
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
     END IF;
  END LOOP;
END;
$function$;
