/* The deal pipeline, in one place.
 *
 * This CRM started as a POS CRM, so the database default for deals.stage was
 * 'new_lead' and its CHECK allowed only the old POS words (new_lead, contacted,
 * qualified, demo_booked, demo_done...). The construction pipeline on screen is
 * a different set: estimate, proposal, negotiation, verbal, contract.
 *
 * Nothing set a stage when a lead was qualified into a deal, so every new deal
 * landed on the database default: a stage that no column on the board matches,
 * which is why a converted lead vanished. Worse, saving a real stage was
 * refused by the old CHECK and the error was thrown away, so the screen simply
 * did nothing. Migration 080 fixes the database; this file makes sure every
 * screen agrees on the words, and FIRST_STAGE is what a new deal starts on.
 */

export const DEAL_STAGES = [
  { key: 'estimate',        label: 'Estimate / Quote',  short: 'Estimate', color: '#3b82f6', badge: 'bg-blue-100 text-blue-700 border border-blue-200' },
  { key: 'proposal_sent',   label: 'Proposal Sent',     short: 'Proposal', color: '#6366f1', badge: 'bg-indigo-100 text-indigo-700 border border-indigo-200' },
  { key: 'negotiation',     label: 'Negotiation',       short: 'Negotiation', color: '#eab308', badge: 'bg-amber-100 text-amber-700 border border-amber-200' },
  { key: 'verbal',          label: 'Verbal Commitment', short: 'Verbal',   color: '#a855f7', badge: 'bg-purple-100 text-purple-700 border border-purple-200' },
  { key: 'contract_signed', label: 'Contract Signed',   short: 'Signed',   color: '#C75A29', badge: 'bg-orange-100 text-orange-700 border border-orange-200' },
  { key: 'closed_won',      label: 'Won',               short: 'Won',      color: '#10b981', badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  { key: 'closed_lost',     label: 'Lost',              short: 'Lost',     color: '#ef4444', badge: 'bg-slate-100 text-slate-500 border border-slate-200' },
];

export const DEAL_STAGE_MAP = Object.fromEntries(DEAL_STAGES.map(s => [s.key, s]));
export const DEAL_STAGE_KEYS = DEAL_STAGES.map(s => s.key);

/** Where a deal starts: quoting the job. */
export const FIRST_STAGE = 'estimate';

/** Still being worked, so not won or lost. */
export const OPEN_DEAL_STAGES = DEAL_STAGE_KEYS.filter(k => k !== 'closed_won' && k !== 'closed_lost');

/* Stages from the POS days. Deals were moved off these by migration 080, but
 * old rows in stage_history keep them, and a history line reading nothing at
 * all is worse than one that says what it used to say. */
const LEGACY_LABELS = {
  new_lead: 'New lead', contacted: 'Contacted', qualified: 'Qualified',
  demo_booked: 'Demo booked', demo_done: 'Demo done',
};

/** A label for any stage, now or historical, never blank. */
export function stageLabel(key) {
  if (!key) return '';
  return DEAL_STAGE_MAP[key]?.label || LEGACY_LABELS[key] || String(key).replace(/_/g, ' ');
}

export function stageBadge(key) {
  return DEAL_STAGE_MAP[key]?.badge || 'bg-slate-100 text-slate-600 border border-slate-200';
}
