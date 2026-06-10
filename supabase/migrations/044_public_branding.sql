-- Login screen branding: anon-safe view exposing ONLY presentation fields.
CREATE OR REPLACE VIEW public.public_branding AS
  SELECT logo_url, logo_url_dark, app_name, business_name, primary_color, secondary_color
  FROM public.support_settings WHERE id = 1;
GRANT SELECT ON public.public_branding TO anon, authenticated;
