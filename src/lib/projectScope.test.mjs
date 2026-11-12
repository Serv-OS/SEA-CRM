import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PROJECT_SCOPES, WEBSITE_SERVICE_TO_SCOPE, scopeLabel, scopeFromWebsite } from './projectScope.js';

test('the scope list is exactly the one Peter asked for, in his order', () => {
  assert.deepEqual(PROJECT_SCOPES.map((s) => s.label),
    ['New Construction', 'Remodel', 'Addition', 'ADU', 'Kitchen', 'Bathroom', 'Other']);
  assert.equal(scopeLabel('adu'), 'ADU');
  assert.equal(scopeLabel('Full Home Remodel'), 'Full Home Remodel', 'an old stored value still shows');
  assert.equal(scopeLabel(null), '');
});

test('every website Service Required answer lands on a scope', () => {
  const website = ['Bathroom Remodel', 'Kitchen Remodel', 'Home or Room Addition', 'Full Home Remodel', 'ADU', 'Other'];
  assert.deepEqual(website.map(scopeFromWebsite), ['bathroom', 'kitchen', 'addition', 'remodel', 'adu', 'other']);
  assert.equal(scopeFromWebsite('kitchen'), 'kitchen', 'a key passes through');
  assert.equal(scopeFromWebsite('New Construction'), 'new_construction', 'a label passes through');
  assert.equal(scopeFromWebsite('we want a new bathroom'), 'bathroom');
  assert.equal(scopeFromWebsite('garage'), 'other');
  assert.equal(scopeFromWebsite(''), null);
  assert.equal(scopeFromWebsite(undefined), null);
});

test('the lead screens carry project scope and none of the restaurant fields', () => {
  for (const f of ['../components/crm/LeadDetail.jsx', '../components/crm/LeadBoard.jsx']) {
    const src = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    for (const old of ['venue_type', 'current_pos', 'covers', 'VENUE_TYPES']) {
      assert.ok(!src.includes(old), `${f} still has ${old}`);
    }
    assert.match(src, /PROJECT_SCOPES\.map\(/, `${f} offers the scope list`);
    assert.match(src, /project_scope/, `${f} saves project_scope`);
  }
  const builder = fs.readFileSync(new URL('../components/crm/FormBuilder.jsx', import.meta.url), 'utf8');
  assert.match(builder, /\{ v: 'project_scope', l: 'Lead · Project scope' \}/, 'the form builder can map a field to the scope');
  assert.ok(!builder.includes("'venue_type'"), 'the form builder no longer offers venue type');
});

test('the public form function translates the same website answers the same way', () => {
  const fn = fs.readFileSync(new URL('../../supabase/functions/forms-public/index.ts', import.meta.url), 'utf8');
  for (const [website, key] of Object.entries(WEBSITE_SERVICE_TO_SCOPE)) {
    assert.ok(fn.includes(`"${website}": "${key}"`), `forms-public is missing ${website} -> ${key}`);
  }
  assert.match(fn, /project_scope: scopeFromWebsite\(mapped\.project_scope \|\| mapped\.venue_type\)/, 'forms-public writes the scope from either map');
  assert.ok(!/venue_type: mapped\.venue_type/.test(fn), 'forms-public no longer writes venue_type');
});
