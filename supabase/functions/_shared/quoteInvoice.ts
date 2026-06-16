// Shared: ensure invoices exist for a quote's one-off charges.
//
// STAGED quotes (payment_stages rows present): create ONE invoice per stage,
// each carrying its share of the total, tagged with stage_id. Idempotent per
// stage (re-running never duplicates). The deposit stage's invoice is the one
// charged at signing; the rest are charged manually via "Charge card".
//
// NON-STAGED quotes: a single invoice for the whole one-off total (legacy).
//
// Called when a quote is signed (creates them) and from the Stripe webhook.

// Create (once) the invoice for a single stage. Returns the invoice row.
async function ensureInvoiceForStage(supabase: any, q: any, stage: any, idx: number, count: number): Promise<any | null> {
  const { data: existing } = await supabase.from("invoices").select("*").eq("stage_id", stage.id).limit(1);
  if (existing?.length) return existing[0];

  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  // The stage amount is the GROSS the customer pays; split out tax at the quote rate
  // so each stage invoice itemises net + tax correctly (tax is 0 for psc-crm today).
  const amount = Number(stage.amount) || 0;
  const rate = Number(q.tax_rate) || 0;
  const taxAmount = rate > 0 ? amount - amount / (1 + rate / 100) : 0;
  const subtotal = amount - taxAmount;
  const { data: inv, error } = await supabase.from("invoices").insert({
    quote_id: q.id, company_id: q.company_id, location_id: q.location_id, contact_id: q.contact_id,
    stage_id: stage.id, status: "sent", issue_date: today, due_date: due,
    subtotal, tax_amount: taxAmount, total: amount, tax_rate: rate,
    notes: `Stage ${idx + 1} of ${count} — ${stage.name} (from signed quote Q-${q.quote_number}).`,
    created_by: q.created_by,
  }).select().single();
  if (error || !inv) return null;

  await supabase.from("invoice_line_items").insert({
    invoice_id: inv.id, name: `${stage.name} — stage ${idx + 1} of ${count}`,
    description: `Quote Q-${q.quote_number}`, qty: 1, unit_price: subtotal, tax_rate: rate, sort: 0,
  });
  await supabase.from("payment_stages").update({ status: "invoiced" }).eq("id", stage.id).eq("status", "pending");
  return inv;
}

// Ensure all per-stage invoices exist. Returns the invoice rows, or null if the
// quote is not staged (caller falls back to the single-invoice path).
export async function ensureStageInvoices(supabase: any, q: any): Promise<any[] | null> {
  const { data: stages } = await supabase.from("payment_stages").select("*").eq("quote_id", q.id).order("sort");
  if (!stages?.length) return null;
  const out: any[] = [];
  for (let i = 0; i < stages.length; i++) {
    const inv = await ensureInvoiceForStage(supabase, q, stages[i], i, stages.length);
    if (inv) out.push({ ...inv, _is_deposit: stages[i].is_deposit });
  }
  return out;
}

export async function ensureInvoiceForQuote(supabase: any, q: any): Promise<any | null> {
  if (!q) return null;

  // Staged: create every stage invoice; return the deposit stage's invoice.
  const staged = await ensureStageInvoices(supabase, q);
  if (staged) {
    return staged.find((i) => i._is_deposit) || staged[0] || null;
  }

  // Legacy single-invoice path.
  if (Number(q.one_off_total || 0) <= 0) return null;

  const { data: existing } = await supabase.from("invoices")
    .select("*").eq("quote_id", q.id).is("stage_id", null).limit(1);
  if (existing?.length) return existing[0];

  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const { data: inv, error } = await supabase.from("invoices").insert({
    quote_id: q.id, company_id: q.company_id, location_id: q.location_id, contact_id: q.contact_id,
    status: "sent", issue_date: today, due_date: due,
    subtotal: q.one_off_subtotal, tax_amount: q.tax_amount, total: q.one_off_total,
    notes: `Generated automatically from signed quote Q-${q.quote_number}.`,
    created_by: q.created_by,
  }).select().single();
  if (error || !inv) return null;

  const { data: lines } = await supabase.from("quote_line_items")
    .select("*").eq("quote_id", q.id).eq("billing_type", "one_off").order("sort");
  if (lines?.length) {
    await supabase.from("invoice_line_items").insert(lines.map((l: any, i: number) => ({
      invoice_id: inv.id, name: l.name, description: l.description,
      qty: Number(l.qty) || 1,
      unit_price: (Number(l.unit_price) || 0) * (1 - (Number(l.discount) || 0) / 100),
      tax_rate: Number(l.tax_rate) || 0, sort: i,
    })));
  }
  return inv;
}

export async function quoteContactEmail(supabase: any, q: any): Promise<string> {
  if (!q?.contact_id) return "";
  const { data: c } = await supabase.from("contacts").select("email").eq("id", q.contact_id).maybeSingle();
  return c?.email || "";
}
