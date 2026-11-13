/* Scope of work (migration 086).
 *
 * The lead's Scope of work box becomes version 1 on the deal. Each stage
 * contract carries the scope current when it was made. A later stage adds the
 * next version; the old ones stay, so the change can be seen.
 *
 * Rows are deal_scopes: { version, body, stage, created_by, created_at }.
 */

import { stageLabel } from './dealStages.js';

/** Newest first, whatever order the rows came in. */
export const sortScopes = (rows) => [...(rows || [])].sort((a, b) => (b.version || 0) - (a.version || 0));

/** The current scope: the highest version, or null when there is none. */
export const currentScope = (rows) => sortScopes(rows)[0] || null;

/** Same words, ignoring surrounding space: not a new version. */
export const scopeChanged = (before, after) => (before || '').trim() !== (after || '').trim();

/** "v2 · Initial Designs · 13 Nov 2026" for the history list. */
export function scopeCaption(row, whoName) {
  if (!row) return '';
  const parts = [`v${row.version}`];
  if (row.stage) parts.push(stageLabel(row.stage));
  if (whoName) parts.push(whoName);
  if (row.created_at) parts.push(new Date(row.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }));
  return parts.join(' · ');
}
