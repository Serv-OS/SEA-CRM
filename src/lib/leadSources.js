/* Where a construction lead came from (SEA Design Build, 12 Nov 2026).
 * The list used to be the restaurant CRM's (cold outreach, trade show, POS
 * review site). These are the places a homeowner finds a builder. */
export const LEAD_SOURCES = [
  { key: 'website', label: 'Website' },
  { key: 'referral', label: 'Referral' },
  { key: 'google', label: 'Google' },
  { key: 'houzz', label: 'Houzz' },
  { key: 'yelp', label: 'Yelp' },
  { key: 'nextdoor', label: 'Nextdoor' },
  { key: 'social', label: 'Social media' },
  { key: 'phone_call', label: 'Phone call' },
  { key: 'email', label: 'Email' },
  { key: 'walk_in', label: 'Walk in' },
  { key: 'event', label: 'Home show or event' },
  { key: 'partner', label: 'Architect or partner' },
  { key: 'other', label: 'Other' },
];

export function sourceLabel(key) {
  if (!key) return '';
  const hit = LEAD_SOURCES.find((s) => s.key === key);
  return hit ? hit.label : String(key).replace(/_/g, ' ');
}
