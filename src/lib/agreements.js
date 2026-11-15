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

export const KIND_LABEL = { feasibility: 'Feasibility Agreement', design_build: 'Design / Build Agreement' };

/** What the client pays on the link: the retainer when one is set (design build), else the fee. */
export const amountDue = (a, total) => (a?.due_amount != null && a.due_amount !== '' ? r2(a.due_amount) : r2(total));

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

const money0 = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The Design / Build Agreement text (SEA's document, Nov 2026), filled from the
 * agreement. d = agreement.details: jurisdiction, interior_designer, ca_hourly,
 * revision_hourly, valid_days. The design fee line and the retainer come from
 * the agreement's lines and due_amount.
 */
export function designBuildBlocks({ clientNames, propertyAddress, scopeOfWork, details = {}, fee, retainer }) {
  const who = clientNames?.trim() || '[Client names]';
  const where = propertyAddress?.trim() || '[Property address]';
  const dept = details.jurisdiction?.trim() || '[City or County]';
  const designer = details.interior_designer?.trim() || '[Interior designer]';
  const ca = money0(details.ca_hourly ?? 150);
  const rev = money0(details.revision_hourly ?? 250);
  const valid = Number(details.valid_days) || 30;
  const scope = scopeOfWork?.trim();
  return [
    { p: `${who}, "Client", hereby contracts with SEA Construction, Inc. for the following services for ${where}:` },
    { h: 'Project Scope' },
    ...(scope ? [{ pre: scope }] : []),
    { ul: [
      'Specifications and production documents.',
      `Architectural plans to submit to the ${dept} Building Department for Review and Approval.`,
      `Design Director, Steve Albert, "Director", to communicate with the ${dept} collaborating with Architect and Interior Designer to meet Project Scope described. Director to provide site inspections, preliminary estimates, and preliminary scheduling to facilitate greater efficiency and cost-effective designs as well as all documents necessary for construction contract.`,
      'Project Architect: Drafting of Construction Documents, as directed in consultation with the Client. This phase of work will include investigations of the project site conditions and analysis of the owner proposed designs.',
    ] },
    { h: 'Architectural and Engineering Services' },
    { h2: 'Schematic Design (if not completed during Feasibility study)', ul: [
      'Scan house with LiDAR and generate as-built plans, including floor plan, and elevations.',
      'Prepare schemes with interior designer and architect.',
      'Meetings with client and SEA where the designs will be presented in 3D.',
      'Make revisions as requested by client (a maximum of 3 revisions).',
      'Schematic design plans include proposed floor plan, interior elevations, lighting plan and 3D view.',
    ] },
    { h2: 'Construction drawings', ul: [
      "Upon client's approval prepare construction drawings for a building permit.",
      'Prepare energy compliance forms.',
      `Submit documents online to the ${dept}.`,
      'Respond to plan review comments.',
      'Visit site during construction and address contractor questions.',
    ] },
    { h2: 'Engineering Services', ul: [
      'Prepare foundation/floor framing plan, roof framing plan and details.',
      'Prepare structural calculations for lateral and vertical loads.',
    ] },
    { ul: [`Project Interior Designer: ${designer}, to specify all finishes for the project, within the scope of the renovation.`] },
    { fee: true },
    { ul: ['Other Professional Services. Consultants may be required as deemed necessary by the designer and local governing agencies for such things as soils engineering, energy calculations, geotechnical reports, legal surveys, topographic, grading plans, erosion control maps, landscape plans, engineered grading plans, septic system design, interior design etc.'] },
    { p: 'If fees for consultations are required, the Client will be notified in advance for approval. The Client will be billed for these fees and any management, as described in this agreement.' },
    { h2: 'Construction Administration', ul: [
      'Attend a pre-construction sub walk through.',
      'Visit site at intervals appropriate to the stage of construction or upon request.',
      'Communicate with contractor and owner during construction to address questions.',
      'Make minor revisions to plans due to unforeseen field conditions.',
    ] },
    { p: `Construction Administration Services are not included in the fixed fee. Once construction begins, these services will be billed hourly at ${ca}.` },
    { ul: [
      `Revisions. In the circumstance of revisions to the project scope, as established under the Design Build Phases 2, 3, 4, and 5, hourly fees will be charged at the rate of ${rev} per hour.`,
      'Ownership of Documents. Documents prepared by S.E.A. Construction are instruments of service for use solely with respect to this project. Clients will be provided paper and digital copies of all designs during the process. However, S.E.A. Construction shall retain all common law, statutory and other reserved rights including copyright. The Client shall not reuse or permit the reuse of the documents except by mutual agreement in writing. It is further agreed that the plans will remain the sole property of S.E.A. Construction and are intended for construction by S.E.A. Construction only and may not be used by any other construction entities for any purpose.',
      'Reimbursables. Fees for services necessary to the project are additional and will be billed to the Client. These may include: other service fees if required by local jurisdiction (i.e., arborist, etc.); printing costs; Title 24 fees; school tax fees (if any); soils report (if required); plan check and permit fees; compensation for professional service consultations as mentioned above; sample selections for paint, tile, material, etc.',
      'Retainer and Billing. All related materials, outside services (engineering, consulting, etc.) will be billed bi-monthly, against your retainer, and will include the itemized hours of and work performed by the Designer, the Architect, and Steve Albert, etc. All accrued costs will be deducted from the Client\'s retention bi-monthly, and a reconciliation will be mailed to the Client. Client will be notified when you are nearing the end of your retainer, and a new retainer deposit will be invoiced. These invoices must be paid for work to continue. Any and all monies remaining at the end of Design Development will be credited to the Client towards construction documentation.',
      `Design Phase Billing: A ${money0(retainer)} retainer is required to begin the Design/Build process. Client will be billed every two weeks for all services. Full payment must be received within five business days of bill issuance, unless there is a dispute.`,
      'Stop Work. If, at any time during design or plan preparation, it becomes necessary for Client to cancel or postpone the project, all charges to date will be invoiced and are due and payable within five days of being invoiced, unless there is a dispute. Upon termination of this agreement and payment of invoices, Client will receive documentation of all work to date.',
    ] },
    { p: "All disputes arising from this agreement will be submitted to binding arbitration in California under the rules of the American Arbitration Association. The prevailing party shall be entitled to reasonable attorney's fees and costs." },
    { p: `This proposal is valid for ${valid} days and valid only after fully executed by Contractor and Client and upon receipt of retainer.` },
  ];
}

/**
 * Everything that differs by kind, in one place: the heading, the wording, the
 * fee line label, the terms under the fee, the consent line, what the pay box
 * says and the signature labels.
 */
export const KINDS = {
  feasibility: {
    title: 'FEASIBILITY AGREEMENT', subtitle: 'INVESTIGATIVE DOCUMENTATION',
    blocks: (a) => feasibilityBlocks({ clientNames: a.client_names, propertyAddress: a.property_address, scopeOfWork: a.scope_of_work }),
    feeLabel: 'Feasibility Agreement Fee total', feeInline: false,
    terms: FEASIBILITY_TERMS, consent: FEASIBILITY_CONSENT,
    payTitle: 'Pay the Feasibility Agreement Fee', payNote: 'Your initial onsite meeting is booked once the fee is paid.',
    sellerLabel: 'SEA Construction', clientLabel: 'Client', contactBlock: false, firstLine: 'Feasibility Agreement Fee',
  },
  design_build: {
    title: 'DESIGN / BUILD AGREEMENT', subtitle: 'DESIGN DEVELOPMENT AND CONSTRUCTION DOCUMENTATION',
    blocks: (a, total) => designBuildBlocks({ clientNames: a.client_names, propertyAddress: a.property_address, scopeOfWork: a.scope_of_work, details: a.details || {}, fee: total, retainer: amountDue(a, total) }),
    feeLabel: 'Interior Design and Architectural Plans and Documents for Permit', feeInline: true,
    terms: '', consent: 'I have read and approved this Design/Build Agreement and hereby give my authorization to proceed.',
    payTitle: 'Pay the Design/Build retainer', payNote: 'The retainer begins the Design/Build process. Design work is billed every two weeks against it.',
    sellerLabel: "Contractor's Signature", clientLabel: 'Signature', contactBlock: true, longDate: true, firstLine: 'Interior Design and Architectural Plans and Documents for Permit',
  },
};
export const kindOf = (a) => KINDS[a?.kind] || KINDS.feasibility;
