-- 064_twilio_usage_owner_only.sql
-- Reseller telephony cost/usage is owner-only. The UI already hides the panel
-- from non-owners; this enforces it at the RLS layer so the cost rows aren't
-- API-readable by editors/viewers either. The twilio-usage-sync function uses
-- the service role, which bypasses RLS, so syncing is unaffected.
DROP POLICY IF EXISTS twilio_usage_read ON public.twilio_usage;
CREATE POLICY twilio_usage_read ON public.twilio_usage
  FOR SELECT TO authenticated USING (current_user_role() = 'owner');
