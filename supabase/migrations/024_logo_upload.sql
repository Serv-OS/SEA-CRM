-- Migration 024: uploadable logo (public bucket) used on quotes + app
ALTER TABLE public.support_settings ADD COLUMN IF NOT EXISTS logo_url text;

INSERT INTO storage.buckets (id, name, public) VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN CREATE POLICY branding_read ON storage.objects FOR SELECT USING (bucket_id = 'branding'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY branding_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'branding'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY branding_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'branding'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY branding_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'branding'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
