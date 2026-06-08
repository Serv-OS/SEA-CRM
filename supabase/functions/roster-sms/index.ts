// Rota notification provider. Sends one personalised SMS per recipient when a
// schedule is published. SmsProvider = Twilio (reads the instance's secrets).
// Designed so Email / in-app can be added as alternative providers later.
// Auth: caller JWT must be an owner/editor.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

interface SmsMessage { to: string; body: string; name?: string }

// The SmsProvider interface — swap this implementation to add another gateway.
async function sendViaTwilio(messages: SmsMessage[]) {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!sid || !token || !from) throw new Error("Twilio is not configured for this instance.");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = btoa(`${sid}:${token}`);
  const results = [];
  for (const m of messages) {
    if (!m.to) { results.push({ to: m.to, ok: false, error: "no number" }); continue; }
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: m.to, From: from, Body: m.body }),
      });
      const d = await r.json();
      results.push({ to: m.to, ok: r.ok, sid: d.sid, error: r.ok ? null : (d.message || "send failed") });
    } catch (e) {
      results.push({ to: m.to, ok: false, error: (e as Error).message });
    }
  }
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const auth = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!auth) return json({ error: "Unauthorized" }, 401);
  const { data: { user } } = await supabase.auth.getUser(auth);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!me || !["owner", "editor"].includes(me.role)) return json({ error: "Forbidden" }, 403);

  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) return json({ sent: 0, results: [] });
    const results = await sendViaTwilio(messages);
    return json({ sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
