// Where a website lead came from (migration 090). The website stores the
// Google Ads click id, the UTMs and the first landing page, and forms-public
// saves them on the lead. This turns them into the lines the lead card shows.

/** True when the lead arrived from a paid Google click. */
export function isPaidClick(lead) {
  return !!(lead?.gclid || lead?.gbraid || lead?.wbraid);
}

/** [{ label, value }] for the lead card. Empty when nothing was captured. */
export function attributionLines(lead) {
  if (!lead) return [];
  const paid = isPaidClick(lead);
  const source = [lead.utm_source, lead.utm_medium].filter(Boolean).join(' / ') || (paid ? 'Google Ads' : '');
  const lines = [
    { label: 'Ad source', value: source ? (paid && !/ads|cpc|paid/i.test(source) ? `${source} (paid click)` : source) : '' },
    { label: 'Campaign', value: lead.utm_campaign || '' },
    { label: 'Keyword', value: lead.utm_term || '' },
    { label: 'Ad', value: lead.utm_content || '' },
    { label: 'Landing page', value: lead.landing_page || '' },
    { label: 'Came from', value: referrerHost(lead.referrer) },
  ];
  return lines.filter((l) => l.value);
}

function referrerHost(ref) {
  if (!ref) return '';
  try { return new URL(ref).hostname.replace(/^www\./, ''); } catch { return String(ref); }
}
