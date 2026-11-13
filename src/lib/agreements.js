/* Stage agreements (migration 082). Pure, so the screens, the public page and
 * the tests share one set of sums and one copy of the wording.
 *
 * Money: the fee is the line items added up. Paying by card adds a card fee
 * (1.4% by default) on top, to cover the processing charge; paying by check or
 * bank transfer is the fee alone.
 */

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** The fee: every line's qty x price, to the cent. */
export const agreementTotal = (lines) =>
  r2((lines || []).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0));

/** The card fee on a total, to the cent. */
export const cardFee = (total, pct = 1.4) => r2(Number(total) * (Number(pct) || 0) / 100);

/** What a card payment charges: the total plus the card fee. */
export const cardTotal = (total, pct = 1.4) => r2(Number(total) + cardFee(total, pct));

export const usd = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 10/14/2026, the way SEA's document writes dates. */
export const fmtDocDate = (d) => d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '';

/** Has every client who needs to sign signed? */
export const clientsSigned = (a) => !!a?.client1_signed_at && (!a?.client2_required || !!a?.client2_signed_at);

/** One phrase for where an agreement is, for chips and lists. */
export const agreementStage = (a) => {
  if (!a) return '';
  if (a.status === 'void') return 'Void';
  if (a.paid_at && clientsSigned(a) && a.seller_signed_at) return 'Complete';
  if (clientsSigned(a)) return a.paid_at ? 'Paid, SEA to sign' : 'Signed, awaiting payment';
  if (a.client1_signed_at) return 'Second client to sign';
  return { draft: 'Draft', sent: 'Sent', viewed: 'Viewed' }[a.status] || 'Draft';
};

export const KIND_LABEL = { feasibility: 'Feasibility Agreement' };

/**
 * The Feasibility Agreement text, as blocks the page and the CRM both render.
 * Wording is SEA's document of Oct 2026 (typos fixed).
 */
export function feasibilityBlocks({ clientNames, propertyAddress, scopeOfWork, sellerName = 'SEA Construction' }) {
  const who = clientNames?.trim() || '[Client names]';
  const where = propertyAddress?.trim() || '[Property address]';
  const scope = scopeOfWork?.trim();
  return [
    { p: `Client(s) ${who} hereby contract with ${sellerName} at ${where} to discover client(s) renovation goals and provide a buildable schematic design and budget based on client(s) wants and needs.` },
    // The scope of work the contract was made with (migration 086), kept as typed.
    ...(scope ? [{ h: 'Scope of Work' }, { pre: scope }] : []),
    { h: 'Feasibility Agreement Process' },
    { h2: 'Initial Onsite Meeting', p: 'Design Team (SEA, Interior Designer & Architect) interviews client(s) onsite to determine project goals, to inspect existing conditions and LiDAR the home.' },
    { h2: 'Office (behind the scenes)', p: 'Design Team will explore options to create a 3D design draft and 2 schematic designs that best address the challenges to the existing layout.' },
    { p: 'SEA will check all applicable Zoning and Planning codes related to the work to ensure only fully buildable schematic designs are created.' },
    { note: '*Schematic designs DO NOT include finish, fixture or material selections.' },
    { h2: '1st Online Design Meeting', p: 'Design Team will present a 3D rendering and two proposed schematic designs. Proposed schematic designs will be reviewed and adjusted in real time, through collaboration with client(s). This meeting will result in a preliminary schematic design that best reflects the client(s) vision in the best way the feasibility allows.' },
    { p: 'Schematic designs are sent after the meeting so client(s) can review and provide feedback during the second online schematic design meeting.' },
    { h2: '2nd Online Design Meeting', p: 'This final schematic design meeting is for client(s) to share feedback and make any changes to the proposed schematic design in real time. At the end of this meeting, we will have a schematic design chosen for preliminary budget and permit set timeline preparation. Final preliminary schematic designs sent to client(s).' },
    { h2: 'Preliminary Budget Timeline Review', p: 'In-person or online meeting to discuss preliminary budget and permit set timeline preparation.' },
    { p: 'End of Feasibility Agreement.' },
  ];
}

export const FEASIBILITY_TERMS = 'Payment terms: Initial onsite meeting will not be scheduled until Feasibility Agreement Fee has been paid.';
export const FEASIBILITY_CONSENT = 'I have read and approved this Feasibility Agreement and hereby give my authorization to proceed.';
