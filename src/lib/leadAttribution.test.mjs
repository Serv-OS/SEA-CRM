import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { attributionLines, isPaidClick } from './leadAttribution.js';

test('a Google Ads lead shows source, campaign and keyword', () => {
  const lines = attributionLines({
    gclid: 'abc', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'Search | SEA Remodeling Leads',
    utm_term: 'kitchen remodel burlingame', landing_page: '/kitchen-remodeling-burlingame/', referrer: 'https://www.google.com/',
  });
  assert.deepEqual(lines.map((l) => l.label), ['Ad source', 'Campaign', 'Keyword', 'Landing page', 'Came from']);
  assert.equal(lines[0].value, 'google / cpc');
  assert.equal(lines[4].value, 'google.com');
});

test('a click id with no UTMs still reads as a paid click', () => {
  assert.equal(isPaidClick({ gbraid: 'x' }), true);
  assert.deepEqual(attributionLines({ gclid: 'abc' }), [{ label: 'Ad source', value: 'Google Ads' }]);
  assert.equal(attributionLines({ wbraid: 'x', utm_source: 'google' })[0].value, 'google (paid click)');
});

test('a lead with nothing captured shows nothing', () => {
  assert.deepEqual(attributionLines({ name: 'Old lead' }), []);
  assert.deepEqual(attributionLines(null), []);
  assert.equal(isPaidClick({}), false);
});

test('forms-public writes only the columns migration 090 adds', () => {
  const fn = fs.readFileSync(new URL('../../supabase/functions/forms-public/index.ts', import.meta.url), 'utf8');
  const sql = fs.readFileSync(new URL('../../supabase/migrations/090_website_forms_attribution.sql', import.meta.url), 'utf8');
  const keys = fn.match(/const ATTRIBUTION_TEXT = \[([^\]]+)\]/)[1].match(/[a-z_]+/g);
  for (const k of [...keys, 'first_touch_at']) assert.ok(new RegExp(`add column if not exists ${k}\\s`).test(sql), `090 is missing ${k}`);
  assert.ok(fn.includes('x-website-secret'), 'the website secret check is in place');
  assert.ok(fs.readFileSync(new URL('../components/crm/LeadDetail.jsx', import.meta.url), 'utf8').includes('attributionLines'), 'the lead card shows it');
});
