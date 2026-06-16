// Staff-triggered off-session charge of a stage invoice against the card captured
// at signing. Auth: signed-in owner/editor only (this MOVES money).
//   POST { invoice_id } -> creates+confirms a PaymentIntent off_session.
//
// Double-charge safety:
//  - An ATOMIC claim flips the stage pending|invoiced|failed -> charging; if no
//    row is updated, another charge is already in flight (or it's paid) and we
//    abort. This is the real guard (the invoice only becomes 'paid' later, via
//    the webhook, so status alone can't gate concurrent clicks).
//  - A per-attempt Stripe idempotency key collapses network-level retries.
//  - The deposit stage is owned by the signing Checkout flow and is NOT charged
//    here. The PAID marking is left entirely to the webhook (no double count).
// We always charge the FROZEN payment_stages.amount, never the mutable invoice
// total, so edited line items can't change what gets charged.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const CURRENCY = "usd";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const auth = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(auth);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (prof?.role !== "owner" && prof?.role !== "editor") return json({ error: "Only staff can charge cards." }, 403);

    const { data: conn } = await supabase.from("stripe_connection").select("secret_key").eq("id", 1).maybeSingle();
    const stripeKey = conn?.secret_key || Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Stripe is not connected yet." }, 503);
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });

    const { invoice_id } = await req.json();
    if (!invoice_id) return json({ error: "Missing invoice_id" }, 400);

    const { data: inv } = await supabase.from("invoices").select("*").eq("id", invoice_id).maybeSingle();
    if (!inv) return json({ error: "Invoice not found" }, 404);
    if (inv.status === "paid") return json({ error: "This invoice is already paid." }, 409);

    // Card on file (captured at signing) lives on the quote.
    const { data: quote } = inv.quote_id
      ? await supabase.from("quotes").select("stripe_customer_id, stripe_payment_method_id, quote_number").eq("id", inv.quote_id).maybeSingle()
      : { data: null };
    const customer = quote?.stripe_customer_id;
    const paymentMethod = quote?.stripe_payment_method_id;
    if (!customer || !paymentMethod) {
      return json({ error: "No card on file for this job — send the customer a payment link instead.", code: "no_card" }, 409);
    }

    // Resolve amount + acquire the anti-double-charge claim.
    let amount = Number(inv.total) || 0;
    let stageId: string | null = inv.stage_id || null;
    if (stageId) {
      const { data: stage } = await supabase.from("payment_stages").select("amount, is_deposit").eq("id", stageId).maybeSingle();
      if (stage?.is_deposit) {
        return json({ error: "The deposit is collected when the contract is signed — send a payment link if it's still unpaid.", code: "deposit" }, 409);
      }
      amount = Number(stage?.amount) || 0; // FROZEN amount, never the mutable invoice total
      // Atomic claim: only one caller can move this stage into 'charging'.
      const { data: claimed } = await supabase.from("payment_stages")
        .update({ status: "charging" }).eq("id", stageId).in("status", ["pending", "invoiced", "failed"]).select("id");
      if (!claimed?.length) return json({ error: "This stage is already being charged or has been paid.", code: "in_flight" }, 409);
    } else if (inv.stripe_payment_intent) {
      // Non-stage invoice already has a charge attempt recorded — refuse to re-charge.
      return json({ error: "A charge has already been started for this invoice.", code: "in_flight" }, 409);
    }
    if (amount <= 0) {
      if (stageId) await supabase.from("payment_stages").update({ status: "invoiced" }).eq("id", stageId);
      return json({ error: "Nothing to charge on this invoice." }, 400);
    }

    const releaseFailed = async () => { if (stageId) await supabase.from("payment_stages").update({ status: "failed" }).eq("id", stageId); };

    let pi;
    try {
      pi = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), currency: CURRENCY,
        customer, payment_method: paymentMethod, off_session: true, confirm: true,
        metadata: { source: "stage_charge", invoice_id: inv.id, stage_id: stageId || "" },
        description: `Stage charge — INV-${inv.invoice_number}${quote?.quote_number ? ` (Q-${quote.quote_number})` : ""}`,
      }, { idempotencyKey: crypto.randomUUID() });
    } catch (err: any) {
      const pe = err?.raw?.payment_intent || err?.payment_intent;
      const code = err?.code || err?.raw?.code;
      const needsAuth = code === "authentication_required";
      await releaseFailed();
      await supabase.from("invoices").update({ stripe_payment_intent: pe?.id || null }).eq("id", inv.id);
      await supabase.from("stage_charge_log").insert({
        stage_id: stageId, invoice_id: inv.id, charged_by: user.id, amount, currency: CURRENCY,
        stripe_payment_intent: pe?.id || null, outcome: needsAuth ? "requires_action" : "failed", error: err?.message || "Charge failed",
      });
      return json({ error: err?.message || "The card was declined.", code: needsAuth ? "authentication_required" : "declined" }, 402);
    }

    await supabase.from("invoices").update({ stripe_payment_intent: pi.id }).eq("id", inv.id);

    // An off-session confirm can return without throwing yet not be settled.
    if (pi.status !== "succeeded" && pi.status !== "processing") {
      await releaseFailed();
      await supabase.from("stage_charge_log").insert({
        stage_id: stageId, invoice_id: inv.id, charged_by: user.id, amount, currency: CURRENCY,
        stripe_payment_intent: pi.id, outcome: "requires_action", error: `PaymentIntent status ${pi.status}`,
      });
      return json({ error: "The card needs additional authentication — send the customer a payment link.", code: "authentication_required", status: pi.status }, 402);
    }

    await supabase.from("stage_charge_log").insert({
      stage_id: stageId, invoice_id: inv.id, charged_by: user.id, amount, currency: CURRENCY,
      stripe_payment_intent: pi.id, outcome: pi.status, // webhook finalises the invoice + stage -> paid
    });
    return json({ status: pi.status, payment_intent: pi.id });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
