import { describe, it, expect } from 'vitest';
import { amountDue, designBuildBlocks, constructionBlocks, KINDS, agreementTotal, cardFee, cardTotal, clientsSigned, agreementStage, feasibilityBlocks } from './agreements.js';

describe('agreement money', () => {
  it('adds the lines to the cent', () => {
    expect(agreementTotal([{ qty: 1, unit_price: 2500 }, { qty: 2, unit_price: 0.105 }])).toBe(2500.21);
    expect(agreementTotal([])).toBe(0);
  });
  it('adds a 1.4% card fee for card payments only', () => {
    expect(cardFee(2500)).toBe(35);
    expect(cardTotal(2500)).toBe(2535);
    expect(cardFee(1999.99)).toBe(28);
    expect(cardTotal(1000, 0)).toBe(1000);
  });
});

describe('agreement signatures and stage', () => {
  const base = { status: 'sent', client2_required: false };
  it('needs the second client only when there is one', () => {
    expect(clientsSigned({ ...base, client1_signed_at: 'x' })).toBe(true);
    expect(clientsSigned({ ...base, client2_required: true, client1_signed_at: 'x' })).toBe(false);
    expect(clientsSigned({ ...base, client2_required: true, client1_signed_at: 'x', client2_signed_at: 'y' })).toBe(true);
  });
  it('says where the agreement is', () => {
    expect(agreementStage({ status: 'draft' })).toBe('Draft');
    expect(agreementStage({ ...base, client2_required: true, client1_signed_at: 'x' })).toBe('Second client to sign');
    expect(agreementStage({ ...base, client1_signed_at: 'x' })).toBe('Signed, awaiting payment');
    expect(agreementStage({ ...base, client1_signed_at: 'x', paid_at: 'p' })).toBe('Paid, SEA to sign');
    expect(agreementStage({ ...base, client1_signed_at: 'x', paid_at: 'p', seller_signed_at: 's' })).toBe('Complete');
    expect(agreementStage({ status: 'void', paid_at: 'p' })).toBe('Void');
  });
});

describe('feasibility wording', () => {
  it('fills the clients and the property into the opening line', () => {
    const [first] = feasibilityBlocks({ clientNames: 'Andy and Jessie Tohmc', propertyAddress: '1309 Bel Air Rd, San Mateo, CA 94402' });
    expect(first.p).toBe('Client(s) Andy and Jessie Tohmc hereby contract with SEA Construction at 1309 Bel Air Rd, San Mateo, CA 94402 to discover client(s) renovation goals and provide a buildable schematic design and budget based on client(s) wants and needs.');
  });
  it('shows a gap rather than nothing when a detail is missing', () => {
    expect(feasibilityBlocks({})[0].p).toContain('[Client names]');
    expect(feasibilityBlocks({})[0].p).toContain('[Property address]');
  });
});

describe('design build agreement', () => {
  it('asks for the retainer on the link when one is set, else the fee', () => {
    expect(amountDue({ due_amount: 3000 }, 48000)).toBe(3000);
    expect(amountDue({ due_amount: null }, 2500)).toBe(2500);
    expect(amountDue({}, 2500)).toBe(2500);
  });
  it('fills the building department, designer, rates, retainer and validity', () => {
    const text = JSON.stringify(designBuildBlocks({
      clientNames: 'Krista and Larry Zitnick', propertyAddress: '12 Oak Ave, Burlingame, CA 94010',
      details: { jurisdiction: 'City of Burlingame', interior_designer: 'Patricia McIntosh', ca_hourly: 150, revision_hourly: 250, valid_days: 30 },
      retainer: 3000,
    }));
    expect(text).toContain('Krista and Larry Zitnick, \\"Client\\", hereby contracts with SEA Construction, Inc. for the following services for 12 Oak Ave, Burlingame, CA 94010');
    expect(text).toContain('City of Burlingame Building Department');
    expect(text).toContain('Patricia McIntosh');
    expect(text).toContain('billed hourly at $150.00');
    expect(text).toContain('rate of $250.00 per hour');
    expect(text).toContain('A $3,000.00 retainer is required');
    expect(text).toContain('valid for 30 days');
  });
  it('shows a gap, never a wrong city, when the building department is not set', () => {
    expect(JSON.stringify(designBuildBlocks({}))).toContain('[City or County] Building Department');
  });
  it('has the wording for every kind', () => {
    expect(Object.keys(KINDS)).toEqual(['feasibility', 'design_build', 'construction']);
  });
});

describe('construction contract', () => {
  const blocks = constructionBlocks({
    clientNames: 'Matt and Sarah Jados', propertyAddress: '10 Wilmington Circle, Redwood City, CA 94062',
    details: { exhibit_date: '2026-07-30', completion_months: 6, warranty_years: 10, markup_percent: 20 }, total: 231206.78,
  });
  const text = JSON.stringify(blocks);
  it('fills the sum, scope date, completion time, warranty and markup', () => {
    expect(text).toContain('FOR THE SUM OF $231,206.78');
    expect(text).toContain('scope dated 07/30/2026');
    expect(text).toContain('approximately 6 months');
    expect(text).toContain('a period of 10 years');
    expect(text).toContain('markup all purchases 20% over invoice');
  });
  it('numbers all 30 sections and puts initials where SEA\'s contract does', () => {
    expect(blocks.filter(b => b.n).map(b => b.n)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(blocks.filter(b => b.initials).length).toBe(28);
  });
  it('shows gaps, never made up numbers, when details are missing', () => {
    const t = JSON.stringify(constructionBlocks({}));
    expect(t).toContain('scope dated [date]');
    expect(t).toContain('approximately [number of] months');
  });
  it('asks for nothing on the link and is complete once both sides sign', () => {
    const a = { kind: 'construction', due_amount: 0, status: 'signed', client2_required: false, client1_signed_at: 'x' };
    expect(amountDue(a, 231206.78)).toBe(0);
    expect(agreementStage(a)).toBe('Signed, SEA to sign');
    expect(agreementStage({ ...a, seller_signed_at: 's' })).toBe('Complete');
  });
});
