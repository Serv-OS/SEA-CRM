// Canonical lead stage metadata — single source of truth for badges/colors
// everywhere lead status is shown (lead board, company/contact/location records).
export const LEAD_STAGES = [
  { key: 'new_lead',     label: 'New Lead',             short: 'Lead',        rank: 1, color: '#3b82f6', badge: 'bg-blue-100 text-blue-700 border border-blue-200' },
  { key: 'attempting',   label: 'Attempting',           short: 'Attempting',  rank: 2, color: '#6366f1', badge: 'bg-indigo-100 text-indigo-700 border border-indigo-200' },
  { key: 'mql',          label: 'Marketing Qualified',  short: 'MQL',         rank: 3, color: '#8b5cf6', badge: 'bg-purple-100 text-purple-700 border border-purple-200' },
  { key: 'sql',          label: 'Sales Qualified',      short: 'SQL',         rank: 4, color: '#E8743C', badge: 'bg-orange-100 text-orange-700 border border-orange-200' },
  { key: 'deal',         label: 'Deal',                 short: 'Deal',        rank: 5, color: '#10b981', badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  { key: 'disqualified', label: 'Disqualified',         short: 'DQ',          rank: 0, color: '#ef4444', badge: 'bg-slate-100 text-slate-500 border border-slate-200' },
];

export const LEAD_STAGE_MAP = Object.fromEntries(LEAD_STAGES.map(s => [s.key, s]));

// Active (in-pipeline) stages, ordered — for filters and progress
export const ACTIVE_LEAD_STAGES = LEAD_STAGES.filter(s => s.key !== 'disqualified' && s.key !== 'deal');

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
