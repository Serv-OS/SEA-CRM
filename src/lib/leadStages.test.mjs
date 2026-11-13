import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LEAD_STAGES, LEAD_FLOW, DEAL_STEP, leadStep, primaryLead } from './leadStages.js';

test('the SEA lead flow is New > Sent Initial Response Email > Follow Up > Qualified > Deals / Clients', () => {
  assert.deepEqual(LEAD_FLOW, ['new_lead', 'responded', 'follow_up', 'qualified', 'deal']);
  const byKey = Object.fromEntries(LEAD_STAGES.map((s) => [s.key, s.label]));
  assert.equal(byKey.new_lead, 'New');
  assert.equal(byKey.responded, 'Sent Initial Response Email');
  assert.equal(byKey.follow_up, 'Follow Up');
  assert.equal(byKey.qualified, 'Qualified');
  assert.equal(DEAL_STEP.label, 'Deals / Clients');
  assert.ok(!('attempting' in byKey) && !('contacted' in byKey), 'the POS stage names are gone');
});

test('a qualified lead with a deal sits on Deals / Clients; without one it is still Qualified', () => {
  assert.equal(leadStep({ stage: 'qualified', deal_id: 'd1' }), 'deal');
  assert.equal(leadStep({ stage: 'qualified', deal_id: null }), 'qualified');
  assert.equal(leadStep({ stage: 'follow_up', deal_id: 'd1' }), 'follow_up');
  assert.equal(primaryLead([{ stage: 'new_lead' }, { stage: 'follow_up' }]).stage, 'follow_up');
});

test('the lead screens take the flow from the module and the old names are nowhere', () => {
  const files = {
    '../components/crm/LeadBoard.jsx': [/COLUMNS = \[\.\.\.ACTIVE_LEAD_STAGES, DEAL_STEP, LEAD_STAGE_MAP\.disqualified\]/, /makeDeal\(/],
    '../components/crm/LeadDetail.jsx': [/LEAD_FLOW\.map\(/, /if \(s === DEAL_STEP\.key\) \{ await makeDeal\(\); return; \}/],
    '../components/crm/ReportingDashboard.jsx': [/LEAD_OPEN_STAGES = \['new_lead','responded','follow_up'\]/],
  };
  for (const [f, pins] of Object.entries(files)) {
    const src = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    for (const re of pins) assert.match(src, re, `${f} lost ${re}`);
    assert.ok(!/'attempting'(?!,'contacted'\])/.test(src.replace(/LEAD_ENGAGED_STAGES = .*\n/, '')), `${f} still names attempting`);
    if (f.includes('Lead')) assert.ok(!/const STAGES = \[|STAGE_FLOW|STAGE_LABELS/.test(src), `${f} keeps its own lead stage list`);
  }
});
