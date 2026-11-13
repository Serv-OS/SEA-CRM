// Canonical lead stage metadata, the single source of truth for badges, colours,
// the board columns and the stage bar everywhere lead status is shown.
//
// 12 Nov 2026 (Peter): the SEA lead flow is
//   New > Sent Initial Response Email > Follow Up > Qualified > Deal/Clients
// The first four are lead stages. Deal/Clients is the step after: the lead
// is qualified AND has its deal, which is where the customer lives from then on.
// Migration 085 renamed the old POS stages (attempting, contacted) in the database.
export const LEAD_STAGES = [
  { key: 'new_lead',     label: 'New',                         short: 'New',           rank: 1, color: '#3b82f6', badge: 'bg-blue-100 text-blue-700 border border-blue-200' },
  { key: 'responded',    label: 'Sent Initial Response Email', short: 'Response sent', rank: 2, color: '#6366f1', badge: 'bg-indigo-100 text-indigo-700 border border-indigo-200' },
  { key: 'follow_up',    label: 'Follow Up',                   short: 'Follow up',     rank: 3, color: '#8b5cf6', badge: 'bg-purple-100 text-purple-700 border border-purple-200' },
  { key: 'qualified',    label: 'Qualified',                   short: 'Qualified',     rank: 4, color: '#10b981', badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  { key: 'disqualified', label: 'Disqualified',                short: 'DQ',            rank: 0, color: '#ef4444', badge: 'bg-slate-100 text-slate-500 border border-slate-200' },
];

/** The step after Qualified: the lead has its deal. Not a leads.stage value. */
export const DEAL_STEP = { key: 'deal', label: 'Deal/Clients', short: 'Deal/Clients', color: '#0ea5e9' };

export const LEAD_STAGE_MAP = Object.fromEntries(LEAD_STAGES.map(s => [s.key, s]));

// Active (in-pipeline) stages, ordered, for filters and progress
export const ACTIVE_LEAD_STAGES = LEAD_STAGES.filter(s => s.key !== 'disqualified');

// The stage bar and the board columns, in Peter's order (Disqualified is kept apart).
export const LEAD_FLOW = [...ACTIVE_LEAD_STAGES.map(s => s.key), DEAL_STEP.key];

/** Which column or step a lead sits on: a qualified lead with a deal is on Deal/Clients. */
export function leadStep(lead) {
  if (!lead) return null;
  if (lead.stage === 'qualified' && lead.deal_id) return DEAL_STEP.key;
  return lead.stage;
}

// Old stage names still found in stage_history rows written before migration 085.
export const LEGACY_LEAD_STAGES = { attempting: 'responded', contacted: 'follow_up' };

// Pick the most relevant lead for a record that may have several:
// prefer the most-advanced active lead; fall back to the best terminal one.
export function primaryLead(leads) {
  if (!leads || leads.length === 0) return null;
  const active = leads.filter(l => l.stage !== 'disqualified');
  const pool = active.length ? active : leads;
  return pool.reduce((best, l) =>
    (LEAD_STAGE_MAP[l.stage]?.rank ?? -1) > (LEAD_STAGE_MAP[best.stage]?.rank ?? -1) ? l : best
  );
}
