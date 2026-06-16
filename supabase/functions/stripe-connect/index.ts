// In-app Stripe connection.
//   GET           -> connection status (no secrets returned)
//   POST {secret_key} -> validate the key, auto-create the checkout webhook,
//        store key + webhook secret server-side
//   DELETE        -> disconnect
// Auth: requires a signed-in owner (verified via the caller's JWT).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Require an owner
  const auth = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!auth) return json({ error: "Unauthorized" }, 401);
  const { data: { user } } = await supabase.auth.getUser(auth);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (prof?.role !== "owner") return json({ error: "Only owners can manage payments." }, 403);

  try {
    if (req.method === "GET") {
      const { data } = await supabase.from("stripe_connection").select("account_name, livemode, connected_at").eq("id", 1).maybeSingle();
      return json({ connected: !!data?.connected_at, account_name: data?.account_name || null, livemode: data?.livemode ?? null });
    }

    if (req.method === "DELETE") {
      const { data } = await supabase.from("stripe_connection").select("secret_key, webhook_id").eq("id", 1).maybeSingle();
      if (data?.secret_key && data.webhook_id) {
        await fetch(`https://api.stripe.com/v1/webhook_endpoints/${data.webhook_id}`, { method: "DELETE", headers: { Authorization: `Bearer ${data.secret_key}` } }).catch(() => {});
      }
      await supabase.from("stripe_connection").delete().eq("id", 1);
      return json({ connected: false });
    }

    // POST = connect
    const { secret_key } = await req.json();
    if (!secret_key || !secret_key.startsWith("sk_")) return json({ error: "Enter a valid Stripe secret key (sk_…)." }, 422);

    // Validate by reading the account
    const acctRes = await fetch("https://api.stripe.com/v1/account", { headers: { Authorization: `Bearer ${secret_key}` } });
    const acct = await acctRes.json();
    if (!acctRes.ok) return json({ error: acct.error?.message || "That key was rejected by Stripe." }, 400);

    const accountName = acct.business_profile?.name || acct.settings?.dashboard?.display_name || acct.email || acct.id;
    const livemode = secret_key.startsWith("sk_live");

    // Remove any previous webhook we created, then create a fresh one
    const { data: prev } = await supabase.from("stripe_connection").select("webhook_id, secret_key").eq("id", 1).maybeSingle();
    if (prev?.webhook_id && prev.secret_key) {
      await fetch(`https://api.stripe.com/v1/webhook_endpoints/${prev.webhook_id}`, { method: "DELETE", headers: { Authorization: `Bearer ${prev.secret_key}` } }).catch(() => {});
    }

    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-webhook`;
    // checkout.session.completed = deposits/online payments; payment_intent.*
    // = staff-triggered off-session stage charges. All three are required.
    const whBody = new URLSearchParams();
    whBody.set("url", webhookUrl);
    whBody.append("enabled_events[]", "checkout.session.completed");
    whBody.append("enabled_events[]", "payment_intent.succeeded");
    whBody.append("enabled_events[]", "payment_intent.payment_failed");
    whBody.set("description", "ServOS CRM quotes & staged charges");
    const whRes = await fetch("https://api.stripe.com/v1/webhook_endpoints", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret_key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: whBody.toString(),
    });
    const wh = await whRes.json();
    if (!whRes.ok) return json({ error: wh.error?.message || "Could not register the Stripe webhook." }, 400);

    await supabase.from("stripe_connection").upsert({
      id: 1, secret_key, webhook_secret: wh.secret, webhook_id: wh.id,
      account_id: acct.id, account_name: accountName, livemode, connected_at: new Date().toISOString(),
    }, { onConflict: "id" });

    return json({ connected: true, account_name: accountName, livemode });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
