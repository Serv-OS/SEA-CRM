import { supabase } from './supabase';

/* Marking junk lives here, not in a screen, because it is offered from two
 * places (the ticket and the list) and the two must never drift: block the
 * sender, take the ticket out of the queue, leave a trace.
 *
 * Returns { ok, message } — never throws, so a caller in a list can junk
 * several in a row without one failure stopping the rest.
 */
export async function markTicketJunk(ticket, profile, { kind = 'email' } = {}) {
  const from = (ticket?.customer_email || '').toLowerCase().trim();
  if (!from) return { ok: false, message: 'That ticket has no sender email, so there is nothing to block.' };

  const domain = from.split('@')[1] || '';
  const value = kind === 'domain' ? domain : from;
  if (!value) return { ok: false, message: 'Could not read the sender address.' };

  const { error } = await supabase.from('blocked_senders').insert({
    value, kind,
    reason: `Marked as junk from ticket #${ticket.ticket_number ?? ''}`.trim(),
    blocked_by: profile.id,
  });
  // Already blocked is the desired end state, not a failure.
  if (error && !/duplicate|unique/i.test(error.message)) {
    return { ok: false, message: 'Could not block: ' + error.message };
  }

  if (ticket.stage !== 'closed') {
    await supabase.from('tickets')
      .update({ stage: 'closed', closed_at: new Date().toISOString() }).eq('id', ticket.id);
    await supabase.from('stage_history').insert({
      object_type: 'ticket', object_id: ticket.id,
      from_stage: ticket.stage, to_stage: 'closed', changed_by: profile.id,
    });
  }
  await supabase.from('crm_activities').insert({
    type: 'note', subject_type: 'ticket', subject_id: ticket.id, actor_id: profile.id, is_internal: true,
    subject: 'Marked as junk',
    body: kind === 'domain' ? `Blocked every sender at @${value}.` : `Blocked ${value}.`,
    channel_metadata: { kind: 'junk_blocked', value, block_kind: kind },
  });

  return {
    ok: true,
    message: kind === 'domain'
      ? `Blocked @${value}. Mail from that domain will no longer create tickets.`
      : `Blocked ${value}. Their mail will no longer create tickets.`,
  };
}
