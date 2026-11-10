import { describe, it, expect } from 'vitest';
import { agreementTotal, cardFee, cardTotal, clientsSigned, agreementStage, feasibilityBlocks } from './agreements.js';

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
