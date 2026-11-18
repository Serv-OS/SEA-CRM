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
  // A contract with nothing to pay on the link (construction) is done once signed.
  const noPay = a.due_amount != null && Number(a.due_amount) === 0;
  if (noPay && clientsSigned(a)) return a.seller_signed_at ? 'Complete' : 'Signed, SEA to sign';
  if (a.paid_at && clientsSigned(a) && a.seller_signed_at) return 'Complete';
  if (clientsSigned(a)) return a.paid_at ? 'Paid, SEA to sign' : 'Signed, awaiting payment';
  if (a.client1_signed_at) return 'Second client to sign';
  return { draft: 'Draft', sent: 'Sent', viewed: 'Viewed' }[a.status] || 'Draft';
};

export const KIND_LABEL = { feasibility: 'Feasibility Agreement', design_build: 'Design / Build Agreement', construction: 'Construction Contract' };

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

/**
 * SEA's fixed price Construction Contract (Nov 2026, "price increase verbiage"
 * version), filled from the agreement. Every clause the owners initial carries
 * { initials: true }. d = details: exhibit_date, completion_months, storage,
 * payment_terms, warranty_years, markup_percent.
 */
export function constructionBlocks({ clientNames, propertyAddress, scopeOfWork, details = {}, total }) {
  const owners = clientNames?.trim() || '[Property owners]';
  const where = propertyAddress?.trim() || '[Property address]';
  const scopeDate = details.exhibit_date ? fmtDocDate(details.exhibit_date) : '[date]';
  const months = details.completion_months != null && details.completion_months !== '' ? `${details.completion_months}` : '[number of]';
  const warranty = Number(details.warranty_years) || 10;
  const markup = details.markup_percent != null && details.markup_percent !== '' ? Number(details.markup_percent) : 20;
  const scope = scopeOfWork?.trim();
  const I = { initials: true };
  return [
    { parties: { owners, where } },
    { n: 1, h2: 'Parties', p: 'S.E.A. Construction Inc. ("Contractor") is, and all subcontractors used by Contractor under this Contract will be, licensed and regulated by the California Contractors State License Board. Any questions concerning a contractor may be referred to the registrar of the board whose address is: 9821 Business Park Drive, Sacramento, CA 95827.' },
    ...(scope ? [{ h: 'Scope of Work' }, { pre: scope }] : []),
    { n: 2, h2: 'Plans and Permits', p: `Contractor proposes to furnish all materials and all labor necessary to complete the following work of improvement on the following described real property located at the above address. All work and improvement in accordance with S.E.A. Construction unit cost estimate and scope dated ${scopeDate}, and approved plans, attached as "Exhibit A". Owner agrees to reimburse SEA for all permits and plans and pay all fees necessary for construction. If necessary, SEA will contract with professionals for additional drawings or engineering necessary during the course of construction.` }, I,
    { n: 3, h2: 'Timing', p: `The work to make the Improvements will commence on a date mutually agreed on by Contractor and Property Owners. All of the above work to be completed in a substantial and workmanlike manner according to the best standard practices for contractors in the West Bay Area. Completion time should be approximately ${months} months, save and except for any delays caused by strikes, acts of God, or other unforeseen happenstance over which Contractor has no control including, but not limited to work shutdowns due to COVID-19 illness or state or local mandates related to COVID-19. Inspections and holidays will not be counted as actual workdays. Contractor agrees that Property Owners may change the scope of work at their discretion, subject to change order provisions found in Paragraph 5 of this contract. Property Owners agree that additional scope will add additional time to completion and will give ample notice to Contractor to adjust scope. Owners further understand that changes to materials selection and delays resulting from materials orders beyond the control of Contractor may add additional time to completion.` }, I,
    { n: 4, h2: 'Cost of Improvements', p: `The Improvements will be completed by Contractor FOR THE SUM OF ${usd(total)}. Except as otherwise provided in this contract, this sum represents a fixed price for all labor and materials needed to complete the works of improvement contemplated by this contract. The sum does not include any design and related work that may be requested by Owners or that may be required in the event of a change in scope. Should the scope of work increase or selections change, any difference in cost will be documented in Buildertrend as a Change Order (additional cost) or Contract Credit (reduced cost).` },
    { fee: true }, I,
    { n: 5, h2: 'Changes or Additions ("Change Orders")', p: 'Any alteration or deviation from the above specifications involving extra cost of material or labor will only be executed upon written orders for same, to be signed by the Property Owner and may affect estimated completion date of the contract. The estimated number of added days, if any, as a result of a "change order", shall be noted at the bottom of the proposed change order. Owner will be responsible for accepting or declining proposed change orders in a timely basis. A delay in finalizing a change order may affect the progress of the contracted or proposed work. The signature of any one of several co-owners shall be binding on any non-signing Property Owner(s).' },
    { p: 'Property Owners agree to regularly review their Buildertrend account and/or email for Change Order or Addition notifications.' },
    { p: 'Property Owners will be billed for the cost of the change order (on a bid, or time and materials basis) over and above the stated sum of the contract and agree to pay proposed change order in full immediately upon acceptance. A failure of payment on any change order shall be considered a material breach of this contract and shall entitle the Contractor, at his option, to terminate this agreement in addition to all other remedies, which may be available to Contractor.' }, I,
    { n: 6, h2: 'SEA to Direct Work', p: "Property Owner understands and agrees that SEA Management is solely responsible for directing SEA employees and SEA hired subcontractors in all aspects of the project. The purpose of this is to ensure the safe, efficient, timely and proper completion of the contract. Accordingly, Property Owner shall not manage, assist or otherwise direct any SEA employees or SEA hired subcontractors in the performance of any aspect of the contract, without the express permission from SEA Management. Any work directed by Property Owner in violation of this provision shall void SEA's warranty with respect to said unauthorized and improperly directed work and will void any applicable insurance coverage. SEA shall not be liable in contract or tort for any damages or injuries that result from Property Owner directed work in violation of this provision." }, I,
    { n: 7, h2: 'Manner of Payment', p: 'Property Owner agrees to make the following payments to Contractor:' },
    { pre: details.payment_terms?.trim() || 'Billed Twice-Monthly based on Actual Percentage of Completion and Installed Labor and Materials (Due and payable upon receipt).' }, I,
    { p: "All sums not paid within Ten (10) days of receipt of a bill shall bear interest at the rate of 1.5% per month or the maximum legal rate, whichever is less. If any payment is not made when due, Contractor may keep the job completely idle until such time as all payments due have been made. A failure of payment for a period in excess of ten (10) days shall be considered a material breach of this contract and shall entitle the Contractor, at his option, to terminate this agreement in addition to all other remedies, which may be available to Contractor. The final payment shall not be due until Contractor has delivered to the owner a complete release of all liens arising out of this agreement. If any lien remains unsatisfied after all payments are made, Contractor shall refund to the Owner all money the Owner may be compelled to pay in discharging such lien, including all costs and reasonable attorneys' fees." }, I,
    { n: 8, h2: 'Hidden Conditions', p: 'Contractor shall not be responsible for repair or correction of any concealed conditions, or unforeseen defects, including structural inadequacies, termite damage, asbestos, and dry rot unless they are specifically noted in the scope of work hereunder. Contractor will provide estimates to repair and correct such defects subject to the approval of the Owner. Remediation of hidden conditions by Contractor or other authorized third party may cause a delay in the completion of the contract.' }, I,
    { n: 9, h2: 'Storage', p: details.storage?.trim() || 'Construction will require the garage for storage and placement of materials to be used on the project.' }, I,
    { n: 10, h2: 'Protection', p: 'Contractor will take all reasonable actions to reduce dust and debris from leaving work areas including installing temporary plastic doors between the areas under construction and the remainder of the house. Nevertheless, Property Owners understand that dust and debris will be in and around the house during the course of alterations.' }, I,
    { n: 11, h2: 'Inspections', p: 'Any increase in the scope of work from that set forth in the Exhibits hereto which is required by plan check or field inspectors with city or county Building/Planning Departments will be treated as additional work to this contract. Owners understand that delays encountered from waiting on inspections will not be the fault of contractor and may possibly delay completion time. Special inspections from outside agencies as specified by the City or County are not included in this contract. All fees, as well as required management time will be billed in a change order and be subject to all obligations associated with change orders as stipulated elsewhere in this contract.' }, I,
    { n: 12, h2: 'Allowances', p: `An allowance is a specific price for labor or materials that is likely to change, either up or down, depending on client choices or existing conditions. Allowances represent material costs only except where specifically noted and do not include installation charges. If Property Owners provide appliances, plumbing, or lighting fixtures, installation costs may change. If Contractor is asked to purchase appliances, light, or plumbing fixtures or any other finishes not already included in scope and estimate, Contractor will markup all purchases ${markup}% over invoice. If Property Owners provide material not approved by the building department, Contractor is entitled to refuse to install such material or decline any responsibility in the outcome of the related inspections.` }, I,
    { n: 13, h2: 'Notice to Owners', p: 'Under the California Mechanics\' Lien Law, any contractor, subcontractor, laborer, supplier, or other person or entity who helps to improve your property but is not paid for his or her work or supplies has a right to place a lien on your home, land, or property where the work was performed and to sue you in court to obtain payment. This means that after a court hearing, your home, land, and property could be sold by a court officer and the proceeds of the sale used to satisfy what you owe. This can happen even if you have paid your contractor in full if the contractor\'s subcontractors, laborers, or suppliers remain unpaid. To preserve their rights to file a claim or lien against the property, certain claimants such as subcontractors or material suppliers are each required to provide you with a document called "Preliminary Notice." Contractors and laborers who contract with owners directly do not have to provide such a notice since you are aware of their existence as an owner. A preliminary notice is not a lien against your property. Its purpose is to notify you of persons or entities that may have a right to file a lien against your property if they are not paid. In order to perfect their lien rights, a contractor, subcontractor, supplier or laborer must file a mechanics\' lien with the county recorder, which then becomes a recorded lien against your property. Generally, the maximum time allowed for filing a mechanics\' lien against your property is 90 days after substantial completion of your project.' }, I,
    { n: 14, h2: 'Property Owners', p: 'Property owners hereby represent that they are the owners in fee of the Premises whereon the improvements herein specified are to be made, having a deed for the same. Property Owners agree that they are jointly and severally liable to pay amounts due to Contractor under this Contract.' }, I,
    { n: 15, h2: 'Cooperation', p: 'Property Owners shall cooperate with Contractor to ensure the timely implementation and completion of the contract. This includes, but is not limited to, providing full access to the property during normal construction hours, which is Monday through Friday from 8 am to 5 pm.' },
    { p: 'Property Owners further agree to maintain continuous service of utilities to the project site (i.e. water, gas, and electricity), unless otherwise instructed in writing by Contractor. Contractor will cooperate with Property Owner\'s "outside vendors and subcontractors" and hereby advises Property Owners that "outside vendors and subcontractors" may negatively affect the sequence of project scheduling. Property Owners accept responsibility for management and coordination of, and material required for "outside vendors and subcontractors".' },
    { n: 16, h2: 'Notices Between Parties', p: 'Any notice required or permitted under the Contract may be given by ordinary mail, overnight mail or courier at the address contained in this Contract, but such address may be changed by written notice given by one party to the other from time to time. Notice shall be deemed received five days after deposited in the United States mail, first class postage prepaid or next day if delivered by courier.' }, I,
    { n: 17, h2: 'Acts of God', p: "It is understood and agreed that neither party shall be held liable for any damages, due to any loss, damage or delay occasioned by fire, strikes or material stolen after delivery upon premises, lockouts, acts of God or the public enemy, accident, boycotts, material shortages, disturbed labor conditions, delayed delivery of materials from Contractor's suppliers, inclement weather, floods, freight embargoes, causes incident to national emergencies, war or other causes beyond the reasonable control of Contractor." }, I,
    { n: 18, h2: 'COVID-19', p: 'Contractor and Property Owners agree to comply with CDC guidelines to maintain 6 feet or more of social distancing while interacting with each other and to comply with State of California mandatory mask requirements. Contractor and Property Owners agree to report to the other any positive test(s) for COVID-19 as well as any symptoms of COVID-19 including, but not limited to, fever, chills, cough, and shortness of breath.' },
    { p: 'Property Owner agrees that any levies, costs, or fees related to COVID-19 regulations imposed by state or local agencies on Contractor after the signing of this agreement shall be passed along to the Property Owner as a change order.' }, I,
    { n: 19, h2: 'Warranty', p: `Contractor will repair or replace at his option, defects in material or workmanship provided by him or his subcontractors for a period of ${warranty} years from the date of final inspection. If at any time defects become apparent to Property Owners, they shall notify Contractor immediately in writing so the defects may be addressed promptly. If defects are in material supplied by Property Owners, Property Owners are responsible for obtaining replacement material and initiating manufacturer's warranty, should it apply. Contractor will replace such defective materials on a time and materials basis. Contractor does not guarantee against conditions over which it has no control, such as natural characteristics of raw materials or finished products provided by Property Owners; nor against structural damages or conditions; nor against foreign matter thrown against building or roof; nor from damages caused by others; nor from fire, lightning, hail windstorms or other acts of God. If corrective or repair work of a minor nature remains to be accomplished by Contractor after project is ready for occupancy, Contractor shall perform the work expeditiously and Owner shall not withhold any payment pending completion of said work.` },
    { p: "Contractor's Warranty shall ONLY become effective upon full payment by Property Owner of all outstanding balances due on the contract and any change orders." }, I,
    { n: 20, h2: 'Work Allowance and Conflict', p: 'A reasonable allowance on all dimensions shall be allowed. All sizes are outside approximate sizes. NHBA Remodeling Quality Standards shall be the governing allowances. Owner agrees Contractor is not responsible for guaranteeing solid stock wood used in framing, decking, flooring, or other applications in either interior or exterior applications against shrinkage or expansion. Shrinkage and expansion are a natural characteristic of solid wood and is not a defect. All possible caution will be taken by Contractor, however, if any such wood shrinkage or expansion results in cracking of paint, caulking, or finish treatment, or in operable components such as doors and windows becoming inoperable, Owner agrees that touch-up, repainting, refinishing, and refitting are items of extra work not covered by this contract. Owner supplied materials (plumbing, lighting fixtures, appliances) must be on site prior to final date provided by Contractor. Contractor is not responsible for delays that are incurred due to Owner supplied materials being late or damaged, additionally; there may be increased costs for subcontractor stand by time or trip charges.' }, I,
    { n: 21, h2: 'Further Notice to Owners', p: 'State law requires anyone who contracts to do construction work to be licensed by the Contractors State License Board in the license category in which the contractor is going to be working, if the total price of the job is $300.00 or more (including labor and materials). Licensed Contractors are regulated by laws designed to protect the public. If you contract with someone who does not have a license, the Contractors State License Board may be unable to assist you with a complaint and you may be liable for damages arising out of any injuries to the contractor or his or her employees. You may contact the Contractors State License Board to find out if this contractor has a valid license. The Board has complete information on the history of licensed contractors, including any possible suspension revocations, judgments, and citations. The Board has offices throughout California. Please check the government pages in the White Pages for the office nearest you or call 1-800-321-CSLB for more information.' },
    { n: 22, h2: 'Access', p: 'Owner shall provide to Contractor such reasonable access to the job site to enable Contractor and any and all subcontractors and employees to perform the agreed upon work.' }, I,
    { n: 23, h2: 'Signs and Photos', p: "Owner agrees to allow Contractor to post a proprietary sign at the job site during the course of construction. Said sign shall be visible to the public. Owner further agrees to allow Contractor to photograph the completed work for use in connection with Contractor's business and promotional materials." }, I,
    { n: 24, h2: "Attorneys' Fees", p: "In the event legal action is instituted to enforce this Contract, or in the event of any and all disputes arising out of this Contract, the prevailing party shall be entitled to attorney's fees and costs incurred in connection therewith." }, I,
    { n: 25, h2: 'Modification', p: 'Any and all modifications to this Contract must be in writing, signed by both parties.' }, I,
    { n: 26, h2: 'Severability', p: 'In the event any provision of this Contract is held unenforceable by a court of competent jurisdiction, the remaining, valid provisions shall be enforceable.' }, I,
    { n: 27, h2: 'Non-Waiver', p: 'Any waiver of any provision or breach of this Contract shall not be construed as a waiver of any other provision or breach, nor a waiver of any subsequent breach of the same or another provision or condition.' }, I,
    { n: 28, h2: 'California Law', p: 'The Contract shall be governed and construed according to California law.' }, I,
    { n: 29, h2: 'Venue', p: 'Any action to enforce this Contract shall be venued in San Mateo County, California.' }, I,
    { n: 30, h2: 'Complete Agreement', p: 'This Contract and any Exhibits hereto constitute the entire agreement of the parties and the parties are not bound by oral expressions or representations by any party or agent of either party. No back charges or credits will be allowed without written approval from the Contractor.' }, I,
    { p: 'Due to recent monumental changes in the construction industry supply chain we can no longer honor a price quote on materials beyond 30 days.' },
    { p: 'All forms of wood products from framing lumber to moldings have become both scarce and experiencing price fluctuations on a weekly basis.' },
    { p: 'We are experiencing similar issues with windows, cabinetry, concrete and steel, both in pricing and availability. We are continuing to accommodate the uncertainties as best as we can, but please understand there will be volatility in both costs and schedules until the situation stabilizes.' },
    { p: 'We appreciate your understanding and will attempt to smooth any issues as they occur.' },
  ];
}

KINDS.construction = {
  title: 'SEA INC. FIXED PRICE CONTRACT', subtitle: 'CONSTRUCTION CONTRACT',
  blocks: (a, total) => constructionBlocks({ clientNames: a.client_names, propertyAddress: a.property_address, scopeOfWork: a.scope_of_work, details: a.details || {}, total }),
  feeLabel: 'Contract sum', feeInline: true,
  terms: '', consent: 'Contractor and Property Owners hereby execute this Contract as of the date set forth below.',
  payTitle: '', payNote: '',
  sellerLabel: 'Contractor Signature', clientLabel: "Owner's Signature", contactBlock: true, initials: true,
  firstLine: 'Fixed price for the work of improvement',
};
