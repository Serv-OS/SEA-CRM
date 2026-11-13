import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { currentScope, sortScopes, scopeChanged, scopeCaption } from './scopeOfWork.js';
import { feasibilityBlocks } from './agreements.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the current scope is the highest version, old versions are kept in order', () => {
  const rows = [
    { version: 1, body: 'Kitchen', stage: 'feasibility_agreement' },
    { version: 3, body: 'Kitchen, bath and ADU', stage: 'preliminary_estimate' },
    { version: 2, body: 'Kitchen and bath', stage: 'initial_designs' },
  ];
  assert.equal(currentScope(rows).body, 'Kitchen, bath and ADU');
  assert.deepEqual(sortScopes(rows).map(r => r.version), [3, 2, 1]);
  assert.equal(currentScope([]), null);
  assert.equal(scopeCaption(rows[1], 'Peter'), `v3 · Preliminary Estimate · Peter`);
});

test('retyping the same scope is not a change', () => {
  assert.equal(scopeChanged('Kitchen ', ' Kitchen'), false);
  assert.equal(scopeChanged('Kitchen', 'Kitchen and bath'), true);
  assert.equal(scopeChanged(null, ''), false);
});

test('the feasibility agreement prints the scope of work after the opening line', () => {
  const blocks = feasibilityBlocks({ clientNames: 'A and B', propertyAddress: '1 Main St', scopeOfWork: 'Kitchen remodel\nNew island' });
  assert.equal(blocks[1].h, 'Scope of Work');
  assert.equal(blocks[2].pre, 'Kitchen remodel\nNew island');
  const without = feasibilityBlocks({ clientNames: 'A', propertyAddress: '1' });
  assert.equal(without.some(b => b.h === 'Scope of Work'), false);
});

test('the lead box is called Scope of work and becomes version 1 on the deal', () => {
  const detail = read('../components/crm/LeadDetail.jsx');
  const board = read('../components/crm/LeadBoard.jsx');
  assert.match(detail, /label className=\{label\}>Scope of work</);
  assert.doesNotMatch(detail, /Project details/);
  assert.match(detail, /rpc\('add_deal_scope', \{ p_deal_id: deal\.id, p_body: lead\.notes \}\)/);
  assert.match(board, /label className=\{label\}>Scope of work</);
  assert.match(board, /rpc\('add_deal_scope', \{ p_deal_id: deal\.id, p_body: lead\.notes \}\)/);
});

test('the deal page and the agreement page both write a new version through add_deal_scope', () => {
  const deal = read('../components/crm/DealDetail.jsx');
  const agreement = read('../components/crm/AgreementBuilder.jsx');
  const fn = read('../../supabase/functions/agreement-public/index.ts');
  assert.match(deal, /from\('deal_scopes'\)/);
  assert.match(deal, /rpc\('add_deal_scope'/);
  assert.match(agreement, /rpc\('add_deal_scope', \{ p_deal_id: a\.deal_id, p_body: a\.scope_of_work, p_agreement_id: a\.id \}\)/);
  assert.match(agreement, /scope_of_work: a\.scope_of_work \|\| null/);
  assert.match(fn, /scope_of_work: a\.scope_of_work/);
});
