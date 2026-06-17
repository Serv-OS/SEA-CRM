// Microsoft 365 OAuth callback — exchanges the auth code for tokens and stores
// them. Mirrors gmail-oauth-callback. state = "<jwt>" (shared support mailbox)
// or "personal:<jwt>" (the signed-in user's own Outlook mailbox).
//
// Required Supabase secrets: MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { msTokenFromCode, graphMe } from "../_shared/microsoft.ts";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error_description") || url.searchParams.get("error");
  const appUrl = Deno.env.get("APP_URL") || "https://psc-crm.vercel.app";

  if (error) return html(appUrl, false, error);
  if (!code) return html(appUrl, false, "No authorization code");

  try {
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ms-oauth-callback`;
    const tokens = await msTokenFromCode(code, redirectUri);
    if (!tokens.access_token || !tokens.refresh_token) {
      return html(appUrl, false, "Failed to get tokens: " + JSON.stringify(tokens));
    }

    const email = await graphMe(tokens.access_token);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let mode = "support";
    let jwt = state || "";
    if (state && state.startsWith("personal:")) { mode = "personal"; jwt = state.slice("personal:".length); }

    let connectedBy: string | null = null;
    if (jwt) {
      try { const { data: { user } } = await supabase.auth.getUser(jwt); connectedBy = user?.id || null; } catch { /* ignore */ }
    }
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

    if (mode === "personal") {
      if (!connectedBy) return html(appUrl, false, "Not signed in", "ms-oauth-result");
      const { error: e } = await supabase.from("user_integrations").upsert({
        profile_id: connectedBy, provider: "microsoft", email,
        access_token: tokens.access_token, refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt, scope: tokens.scope || null, updated_at: new Date().toISOString(),
      }, { onConflict: "profile_id" });
      if (e) return html(appUrl, false, `Could not save connection: ${e.message}`, "ms-oauth-result");
      return html(appUrl, true, email, "ms-oauth-result");
    }

    // Shared support mailbox.
    const { error: e } = await supabase.from("microsoft_connections").upsert({
      email, access_token: tokens.access_token, refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt, connected_by: connectedBy, is_active: true, updated_at: new Date().toISOString(),
    }, { onConflict: "email" });
    if (e) return html(appUrl, false, `Could not save connection: ${e.message}`);
    return html(appUrl, true, email);
  } catch (err) {
    return html(appUrl, false, (err as Error).message);
  }
});

function html(appUrl: string, success: boolean, detail: string, messageType = "ms-oauth-result") {
  const body = `<!DOCTYPE html><html><head><title>Microsoft 365</title></head><body><script>
  if (window.opener) {
    window.opener.postMessage({ type: '${messageType}', success: ${success}, detail: '${detail.replace(/'/g, "\\'")}' }, '${appUrl}');
    window.close();
  } else { window.location.href = '${appUrl}'; }
  </script><p>${success ? "Microsoft 365 connected — you can close this window." : "Error: " + detail}</p></body></html>`;
  return new Response(body, { headers: { "Content-Type": "text/html" } });
}
