// Stripe webhook.
//  - checkout.session.completed: a quote deposit/payment cleared. Save the card
//    (off-session), mark the relevant stage invoice paid (or the legacy single
//    invoice), close the deal.
//  - payment_intent.succeeded / .payment_failed: a staff-triggered OFF-SESSION
//    stage charge (metadata.source='stage_charge') settled or failed.
// Idempotent: every event id is recorded once in stripe_events (no double-charge).
//
// Required secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (or stored connection)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { invoiceEmailHtml, sendInvoiceEmail } from "../_shared/invoiceEmail.ts";
import { ensureInvoiceForQuote, quoteContactEmail } from "../_shared/quoteInvoice.ts";

// Mark a single invoice paid (in full if the running total reaches its value);
// flip its linked payment stage to 'paid' when fully settled.
async function markInvoicePaid(supabase: any, invoiceId: string, paidAmount: number) {
  const { data: inv } = await supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (!inv) return;
  if (inv.status === "paid") return inv; // already settled — never double-count amount_paid
  const now = new Date().toISOString();
  const newPaid = Number(inv.amount_paid || 0) + paidAmount;
  const fully = newPaid >= Number(inv.total || 0) - 0.01;
  await supabase.from("invoices").update({
    status: fully ? "paid" : inv.status, paid_at: fully ? now : inv.paid_at, amount_paid: newPaid,
  }).eq("id", invoiceId);
  if (fully && inv.stage_id) {
    await supabase.from("payment_stages").update({ status: "paid" }).eq("id", inv.stage_id);
  }
  return { ...inv, amount_paid: newPaid, status: fully ? "paid" : inv.status };
}

// Persist the saved card (Customer + PaymentMethod) captured during a Checkout
// session, so later stages can be charged off-session.
async function saveCardFromSession(stripe: any, supabase: any, session: any) {
  try {
    let pm: string | null = null;
    if (session.payment_intent) {
      const pi = await stripe.paymentIntents.retrieve(session.payment_intent);
      pm = (pi.payment_method as string) || null;
    } else if (session.setup_intent) {
      const si = await stripe.setupIntents.retrieve(session.setup_intent);
      pm = (si.payment_method as string) || null;
    }
    const customer = (session.customer as string) || null;
    const quoteId = session.metadata?.quote_id;
    if (!quoteId) return;
    const patch: Record<string, string> = {};
    if (customer) patch.stripe_customer_id = customer;
    if (pm) patch.stripe_payment_method_id = pm;
    if (Object.keys(patch).length) await supabase.from("quotes").update(patch).eq("id", quoteId);
    if (customer) {
      const { data: q } = await supabase.from("quotes").select("contact_id").eq("id", quoteId).maybeSingle();
      if (q?.contact_id) await supabase.from("contacts").update({ stripe_customer_id: customer }).eq("id", q.contact_id);
    }
  } catch (e) {
    console.error("saveCard failed:", (e as Error).message);
  }
}

// Legacy (non-staged) quote payment -> single receipt invoice + email.
async function createPaidInvoiceForQuote(supabase: any, quoteId: string, paidAmount: number) {
  const { data: q } = await supabase.from("quotes").select("*").eq("id", quoteId).maybeSingle();
  if (!q) return;
  let inv = await ensureInvoiceForQuote(supabase, q);
  const now = new Date().toISOString();
  const fullPayment = paidAmount >= Number(q.one_off_total || 0) - 0.01;

  if (inv) {
    const alreadyPaid = Number(inv.amount_paid || 0);
    const patch: any = fullPayment || alreadyPaid + paidAmount >= Number(inv.total || 0) - 0.01
      ? { status: "paid", paid_at: now, amount_paid: alreadyPaid + paidAmount }
      : { amount_paid: alreadyPaid + paidAmount,
          notes: `${inv.notes ? inv.notes + "\n" : ""}Deposit of $${paidAmount.toFixed(2)} received ${now.slice(0, 10)}. Balance to follow.` };
    await supabase.from("invoices").update(patch).eq("id", inv.id);
    inv = { ...inv, ...patch };
  } else {
    const today = now.slice(0, 10);
    const { data: created, error } = await supabase.from("invoices").insert({
      quote_id: q.id, company_id: q.company_id, location_id: q.location_id, contact_id: q.contact_id,
      status: "paid", issue_date: today, due_date: today,
      subtotal: paidAmount, tax_amount: 0, total: paidAmount, paid_at: now, amount_paid: paidAmount,
      notes: `Payment received for quote Q-${q.quote_number}.`, created_by: q.created_by,
    }).select().single();
    if (error || !created) return;
    await supabase.from("invoice_line_items").insert({
      invoice_id: created.id, name: `Payment on quote Q-${q.quote_number}`,
      description: q.deposit_percent ? `${q.deposit_percent}% deposit` : null,
      qty: 1, unit_price: paidAmount, tax_rate: 0, sort: 0,
    });
    inv = created;
  }

  const recipient = inv.email_to || await quoteContactEmail(supabase, q);
  if (recipient) {
    const { data: seller } = await supabase.from("support_settings")
      .select("business_name, business_email, business_phone, quote_accent, logo_url").eq("id", 1).maybeSingle();
    const appUrl = Deno.env.get("APP_URL") || "https://psc-crm.vercel.app";
    const { subject, html } = invoiceEmailHtml(inv, seller || {}, `${appUrl}/i/${inv.public_token}`, { paid: inv.status === "paid" });
    await sendInvoiceEmail(supabase, recipient, subject, html);
    await supabase.from("invoices").update({ sent_at: new Date().toISOString(), email_to: recipient }).eq("id", inv.id);
  }
}

serve(async (req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: conn } = await supabase.from("stripe_connection").select("secret_key, webhook_secret").eq("id", 1).maybeSingle();
  const stripeKey = conn?.secret_key || Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = conn?.webhook_secret || Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) return new Response("Stripe not configured", { status: 503 });

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig!, webhookSecret, undefined, Stripe.createSubtleCryptoProvider());
  } catch (e) {
    return new Response(`Webhook signature failed: ${(e as Error).message}`, { status: 400 });
  }

  // Idempotency — never process the same event twice. Only a PK conflict (23505)
  // means "already handled"; any other DB error must NOT be swallowed (return 5xx
  // so Stripe retries) or we'd silently drop a real payment event.
  const { error: seen } = await supabase.from("stripe_events").insert({ id: event.id, type: event.type });
  if (seen) {
    if (seen.code === "23505") return new Response(JSON.stringify({ received: true, duplicate: true }), { headers: { "Content-Type": "application/json" } });
    console.error("stripe_events insert failed:", seen.message);
    return new Response("event log failed", { status: 500 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;
      const paid = (session.amount_total || 0) / 100;
      const quoteId = session.metadata?.quote_id;

      if (quoteId) {
        if (session.metadata?.save_card) await saveCardFromSession(stripe, supabase, session);

        // Resolve which invoice this payment settles: explicit invoice_id, else
        // the deposit stage's invoice, else fall back to the legacy single invoice.
        let invoiceId = session.metadata?.invoice_id || null;
        if (!invoiceId && session.metadata?.stage_id) {
          const { data: si } = await supabase.from("invoices").select("id").eq("stage_id", session.metadata.stage_id).maybeSingle();
          invoiceId = si?.id || null;
        }
        // Close the deal + onboarding (idempotent; usually already done at signing).
        await supabase.rpc("execute_quote", { p_quote_id: quoteId });

        if (invoiceId) {
          await markInvoicePaid(supabase, invoiceId, paid);
        } else {
          await supabase.from("quotes").update({ status: "paid", paid_at: new Date().toISOString(), amount_paid: paid, stripe_payment_intent: session.payment_intent || null }).eq("id", quoteId);
          try { await createPaidInvoiceForQuote(supabase, quoteId, paid); }
          catch (e) { console.error("receipt invoice failed:", (e as Error).message); }
        }
      }

      // Standalone invoice payment (customer paid an invoice's public Checkout link).
      const invoiceId = session.metadata?.invoice_id;
      if (invoiceId && !quoteId) await markInvoicePaid(supabase, invoiceId, paid);
    }

    // Staff-triggered off-session stage charge settled.
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as any;
      if (pi.metadata?.source === "stage_charge" && pi.metadata?.invoice_id) {
        await markInvoicePaid(supabase, pi.metadata.invoice_id, (pi.amount_received || pi.amount || 0) / 100);
        if (pi.metadata?.stage_id) await supabase.from("payment_stages").update({ status: "paid" }).eq("id", pi.metadata.stage_id);
        await supabase.from("stage_charge_log").update({ outcome: "succeeded" }).eq("stripe_payment_intent", pi.id);
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as any;
      if (pi.metadata?.source === "stage_charge") {
        if (pi.metadata?.stage_id) await supabase.from("payment_stages").update({ status: "failed" }).eq("id", pi.metadata.stage_id);
        await supabase.from("stage_charge_log").update({ outcome: "failed", error: pi.last_payment_error?.message || null }).eq("stripe_payment_intent", pi.id);
      }
    }
  } catch (e) {
    console.error("webhook handler error:", (e as Error).message);
    // Still ack — the event is recorded; surface failures via logs, not retries.
  }

  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
