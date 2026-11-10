// Stage agreements (migration 082), public link /a/<token>. No auth except
// countersign, which needs a signed in owner or editor.
//   GET  ?token=...                                   -> the agreement to read and sign
//   POST { token, action:'sign', slot:1|2, name, signature }  -> a client signs
//   POST { token, action:'pay', origin }              -> Stripe checkout for the fee + card fee
//   POST { action:'countersign', agreement_id, signature } (staff JWT) -> SEA signs
//
// Money is always worked out here from the line items, never taken from the
// page: the fee is the lines added up, a card payment adds card_fee_percent.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

async function signedUrl(supabase: any, path: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage.from("attachments").createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

async function saveSignature(supabase: any, agreementId: string, who: string, dataUrl: string) {
  const b64 = String(dataUrl || "").split(",")[1] || "";
  if (b64.length < 200) throw new Error("Please draw your signature.");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const path = `agreements/${agreementId}/${who}-${Date.now()}.png`;
  const { error } = await supabase.storage.from("attachments").upload(path, bytes, { contentType: "image/png", upsert: true });
  if (error) throw new Error("Could not save the signature: " + error.message);
  return path;
}

async function linesAndTotal(supabase: any, id: string) {
  const { data } = await supabase.from("agreement_line_items").select("name, description, qty, unit_price, sort").eq("agreement_id", id).order("sort");
  const lines = data || [];
  const total = r2(lines.reduce((s: number, l: any) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0));
  return { lines, total };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    // SEA signs, from the CRM.
    if (body.action === "countersign") {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u } = await supabase.auth.getUser(jwt);
      if (!u?.user) return json({ error: "Sign in first." }, 401);
      const { data: prof } = await supabase.from("profiles").select("id, role").eq("id", u.user.id).maybeSingle();
      if (!prof || !["owner", "editor"].includes(prof.role)) return json({ error: "Only an owner or editor can sign for SEA." }, 403);
      const { data: a } = await supabase.from("agreements").select("id, status").eq("id", body.agreement_id).maybeSingle();
      if (!a) return json({ error: "Agreement not found" }, 404);
      if (a.status === "void") return json({ error: "This agreement is void." }, 409);
      const path = await saveSignature(supabase, a.id, "seller", body.signature);
      await supabase.from("agreements").update({
        seller_signed_at: new Date().toISOString(), seller_signature_path: path, seller_signed_by: prof.id,
        ...(body.name ? { seller_name: String(body.name).trim() } : {}), updated_at: new Date().toISOString(),
      }).eq("id", a.id);
      return json({ ok: true });
    }

    const token = req.method === "GET" ? new URL(req.url).searchParams.get("token") : body.token;
    if (!token) return json({ error: "Missing token" }, 400);
    const { data: a } = await supabase.from("agreements").select("*").eq("public_token", token).maybeSingle();
    if (!a || a.status === "draft") return json({ error: "Agreement not found" }, 404);
    if (a.status === "void") return json({ error: "This agreement has been withdrawn. Please contact us." }, 410);

    if (req.method === "GET") {
      const [{ lines, total }, { data: s }, c1, c2, sl] = await Promise.all([
        linesAndTotal(supabase, a.id),
        supabase.from("support_settings").select("business_name, business_address, business_email, business_phone, quote_accent, logo_url").eq("id", 1).maybeSingle(),
        signedUrl(supabase, a.client1_signature_path), signedUrl(supabase, a.client2_signature_path), signedUrl(supabase, a.seller_signature_path),
      ]);
      if (a.status === "sent") await supabase.from("agreements").update({ status: "viewed" }).eq("id", a.id);
      const { data: conn } = await supabase.from("stripe_connection").select("secret_key").eq("id", 1).maybeSingle();
      const cardOn = !!(conn?.secret_key || Deno.env.get("STRIPE_SECRET_KEY"));
      return json({
        agreement: {
          kind: a.kind, agreement_date: a.agreement_date, client_names: a.client_names, property_address: a.property_address,
          payment_details: a.payment_details, card_fee_percent: Number(a.card_fee_percent), client2_required: a.client2_required,
          client1: { name: a.client1_name, signed_at: a.client1_signed_at, signature_url: c1 },
          client2: { name: a.client2_name, signed_at: a.client2_signed_at, signature_url: c2 },
          seller: { name: a.seller_name, signed_at: a.seller_signed_at, signature_url: sl },
          paid_at: a.paid_at, amount_paid: a.amount_paid, card_fee_paid: a.card_fee_paid, paid_method: a.paid_method,
        },
        lines, total, card_payments: cardOn,
        seller: { name: s?.business_name || "SEA Design Build", address: s?.business_address || "", email: s?.business_email || "", phone: s?.business_phone || "", accent: s?.quote_accent || "#b27b26", logo_url: s?.logo_url || null },
      });
    }

    if (body.action === "sign") {
      const slot = Number(body.slot) === 2 ? 2 : 1;
      if (slot === 2 && !a.client2_required) return json({ error: "There is no second signature on this agreement." }, 422);
      const name = String(body.name || "").trim();
      if (!name) return json({ error: "Please type your full name." }, 422);
      if (a[`client${slot}_signed_at`]) return json({ error: "This signature is already done." }, 409);
      const path = await saveSignature(supabase, a.id, `client${slot}`, body.signature);
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        [`client${slot}_name`]: name, [`client${slot}_signed_at`]: now, [`client${slot}_signature_path`]: path,
        [`client${slot}_ip`]: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null, updated_at: now,
      };
      const after = { ...a, ...patch };
      if (after.client1_signed_at && (!after.client2_required || after.client2_signed_at)) patch.status = "signed";
      await supabase.from("agreements").update(patch).eq("id", a.id);
      return json({ ok: true, all_signed: patch.status === "signed" });
    }

    if (body.action === "pay") {
      if (a.paid_at) return json({ error: "This agreement is already paid." }, 409);
      if (!(a.client1_signed_at && (!a.client2_required || a.client2_signed_at))) return json({ error: "Please sign before paying." }, 409);
      const { data: conn } = await supabase.from("stripe_connection").select("secret_key").eq("id", 1).maybeSingle();
      const key = conn?.secret_key || Deno.env.get("STRIPE_SECRET_KEY");
      if (!key) return json({ error: "Card payments are not set up yet. Please pay using the details shown." }, 503);
      const stripe = new Stripe(key, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });
      const { total } = await linesAndTotal(supabase, a.id);
      if (total <= 0) return json({ error: "There is nothing to pay on this agreement yet." }, 422);
      const fee = r2(total * Number(a.card_fee_percent || 0) / 100);
      const { data: contact } = a.contact_id ? await supabase.from("contacts").select("email").eq("id", a.contact_id).maybeSingle() : { data: null };
      const base = body.origin || new URL(req.url).origin;
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: contact?.email || undefined,
        success_url: `${base}/a/${token}?paid=1`,
        cancel_url: `${base}/a/${token}`,
        metadata: { agreement_id: a.id, fee: String(total), card_fee: String(fee) },
        line_items: [
          { quantity: 1, price_data: { currency: "usd", unit_amount: Math.round(total * 100), product_data: { name: "Feasibility Agreement Fee" } } },
          ...(fee > 0 ? [{ quantity: 1, price_data: { currency: "usd", unit_amount: Math.round(fee * 100), product_data: { name: `Card processing fee (${Number(a.card_fee_percent)}%)` } } }] : []),
        ],
      }, { idempotencyKey: `agreement-${a.id}-${Math.round(total * 100)}-${Math.floor(Date.now() / 600000)}` });
      await supabase.from("agreements").update({ stripe_checkout_id: session.id, total }).eq("id", a.id);
      return json({ url: session.url });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
