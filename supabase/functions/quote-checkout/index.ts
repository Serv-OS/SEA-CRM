// Creates a Stripe Checkout Session when a quote is signed.
//  - Staged quotes: charges the DEPOSIT stage and SAVES the card (off_session)
//    so later stages can be charged with one click.
//  - Deposit / pay-now quotes: charges that amount and also saves the card.
//  - $0 deposit (staged): mode='setup' — captures the card with no charge.
// Returns { url } to redirect the customer to. No auth (public quote).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const CURRENCY = "usd"; // psc-crm is USD-only (multi-currency is a deferred tail item)
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Get or create a Stripe Customer for the quote's contact, reusing any saved id.
async function resolveCustomer(stripe: any, supabase: any, quote: any): Promise<string | null> {
  if (quote.stripe_customer_id) return quote.stripe_customer_id;
  if (!quote.contact_id) return null;
  const { data: contact } = await supabase.from("contacts")
    .select("id, first_name, last_name, email, stripe_customer_id").eq("id", quote.contact_id).maybeSingle();
  if (contact?.stripe_customer_id) {
    await supabase.from("quotes").update({ stripe_customer_id: contact.stripe_customer_id }).eq("id", quote.id);
    return contact.stripe_customer_id;
  }
  // Reuse an existing Stripe Customer with this email before creating a new one
  // (avoids duplicate Customers for repeat clients / contacts created elsewhere).
  if (contact?.email) {
    const existing = await stripe.customers.list({ email: contact.email, limit: 1 });
    if (existing.data[0]) {
      const id = existing.data[0].id;
      if (contact.id) await supabase.from("contacts").update({ stripe_customer_id: id }).eq("id", contact.id);
      await supabase.from("quotes").update({ stripe_customer_id: id }).eq("id", quote.id);
      return id;
    }
  }
  const cust = await stripe.customers.create({
    email: contact?.email || undefined,
    name: [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || undefined,
    metadata: { contact_id: contact?.id || "", quote_id: quote.id },
  });
  if (contact?.id) await supabase.from("contacts").update({ stripe_customer_id: cust.id }).eq("id", contact.id);
  await supabase.from("quotes").update({ stripe_customer_id: cust.id }).eq("id", quote.id);
  return cust.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: conn } = await supabase.from("stripe_connection").select("secret_key").eq("id", 1).maybeSingle();
    const stripeKey = conn?.secret_key || Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Stripe is not connected yet." }, 503);
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });

    const { token, origin } = await req.json();
    if (!token) return json({ error: "Missing token" }, 400);
    const { data: quote } = await supabase.from("quotes").select("*").eq("public_token", token).maybeSingle();
    if (!quote) return json({ error: "Quote not found" }, 404);

    // Figure out what to charge at signing + which stage/invoice it belongs to.
    let amount = Number(quote.one_off_total) || 0;
    let label = `Quote #${quote.quote_number}`;
    const metadata: Record<string, string> = { quote_id: quote.id, quote_token: token, save_card: "1" };

    if (quote.payment_terms === "staged") {
      const { data: dep } = await supabase.from("payment_stages")
        .select("*").eq("quote_id", quote.id).eq("is_deposit", true).maybeSingle();
      if (!dep) return json({ error: "This staged quote has no deposit stage configured." }, 400);
      amount = Number(dep.amount) || 0;
      label = `Quote #${quote.quote_number} — ${dep.name || "Deposit"}`;
      metadata.stage_id = dep.id;
      const { data: depInv } = await supabase.from("invoices").select("id").eq("stage_id", dep.id).maybeSingle();
      if (depInv) metadata.invoice_id = depInv.id;
    } else if (quote.payment_terms === "deposit" && quote.deposit_percent > 0) {
      amount = amount * Number(quote.deposit_percent) / 100;
      label += ` — ${quote.deposit_percent}% deposit`;
    }

    const customer = await resolveCustomer(stripe, supabase, quote);
    if (quote.payment_terms === "staged" && !customer) {
      return json({ error: "A contact is required on this quote so the card can be saved for the staged payments." }, 400);
    }
    const base = origin || new URL(req.url).origin;
    const common = {
      customer: customer || undefined,
      success_url: `${base}/q/${token}?paid=1`,
      cancel_url: `${base}/q/${token}`,
      metadata,
    };

    let session;
    if (amount > 0) {
      // Charge now AND save the card for later off-session stage charges.
      session = await stripe.checkout.sessions.create({
        ...common, mode: "payment",
        payment_intent_data: { setup_future_usage: "off_session" },
        line_items: [{ quantity: 1, price_data: { currency: CURRENCY, unit_amount: Math.round(amount * 100), product_data: { name: label } } }],
      });
    } else {
      // Nothing to charge at signing (e.g. $0 deposit) — just capture the card.
      session = await stripe.checkout.sessions.create({ ...common, mode: "setup" });
    }

    await supabase.from("quotes").update({ stripe_checkout_id: session.id }).eq("id", quote.id);
    return json({ url: session.url });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
