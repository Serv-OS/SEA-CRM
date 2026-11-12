/* Project scope on a lead (SEA Design Build, 12 Nov 2026).
 *
 * The lead form used to carry venue type, covers and current POS, left over
 * from the restaurant CRM this one was cloned from. A construction lead is
 * about the job, so the lead carries ONE field for that: the project scope,
 * in Peter's order. The website's "Service Required" answers land here too,
 * translated by scopeFromWebsite, so the website and the CRM speak one list.
 */

export const PROJECT_SCOPES = [
  { key: 'new_construction', label: 'New Construction' },
  { key: 'remodel', label: 'Remodel' },
  { key: 'addition', label: 'Addition' },
  { key: 'adu', label: 'ADU' },
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'bathroom', label: 'Bathroom' },
  { key: 'other', label: 'Other' },
];

const KEYS = new Set(PROJECT_SCOPES.map((s) => s.key));

/** What the website form offers today, mapped onto the lead's scope keys. */
export const WEBSITE_SERVICE_TO_SCOPE = {
  'bathroom remodel': 'bathroom',
  'kitchen remodel': 'kitchen',
  'home or room addition': 'addition',
  'full home remodel': 'remodel',
  'new construction': 'new_construction',
  'adu': 'adu',
  'other': 'other',
};

/** Label for a stored key; a stored value that is not a key is shown as is. */
export function scopeLabel(key) {
  if (!key) return '';
  const hit = PROJECT_SCOPES.find((s) => s.key === key);
  return hit ? hit.label : String(key);
}

/**
 * Turn whatever a form sent (a website service name, a scope key, a scope
 * label, or free words) into a scope key. Empty gives null. Unknown words give
 * 'other' so a website lead never arrives without a scope.
 */
export function scopeFromWebsite(text) {
  const t = String(text ?? '').trim().toLowerCase();
  if (!t) return null;
  if (KEYS.has(t)) return t;
  if (WEBSITE_SERVICE_TO_SCOPE[t]) return WEBSITE_SERVICE_TO_SCOPE[t];
  const byLabel = PROJECT_SCOPES.find((s) => s.label.toLowerCase() === t);
  if (byLabel) return byLabel.key;
  if (/\bkitchen\b/.test(t)) return 'kitchen';
  if (/\bbath/.test(t)) return 'bathroom';
  if (/\badu\b/.test(t)) return 'adu';
  if (/\baddition\b/.test(t)) return 'addition';
  if (/\bnew (construction|build)\b/.test(t)) return 'new_construction';
  if (/\bremodel/.test(t)) return 'remodel';
  return 'other';
}
