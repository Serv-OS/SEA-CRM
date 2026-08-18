import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

// The junk list. Deliberately visible and reversible: a block that silently
// swallows a customer's mail is worse than the junk it prevents, so every rule
// shows who added it, why, and how much it has actually caught.

export default function BlockedSendersPanel({ profile }) {
  const [rows, setRows] = useState([]);
  const [members, setMembers] = useState([]);
  const [value, setValue] = useState('');
  const [kind, setKind] = useState('email');
  const [busy, setBusy] = useState(false);
  const canWrite = profile.role === 'owner' || profile.role === 'editor';

  const load = async () => {
    const [b, m] = await Promise.all([
      supabase.from('blocked_senders').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, display_name, email'),
    ]);
    setRows(b.data || []);
    setMembers(m.data || []);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    const v = value.trim().toLowerCase().replace(/^@/, '');
    if (!v) return;
    if (kind === 'email' && !v.includes('@')) { alert('That does not look like an email address. Switch to Domain to block a whole domain.'); return; }
    if (kind === 'domain' && v.includes('@')) { alert('For a domain, enter just the domain, e.g. example.com'); return; }
    setBusy(true);
    const { error } = await supabase.from('blocked_senders').insert({ value: v, kind, blocked_by: profile.id, reason: 'Added manually' });
    setBusy(false);
    if (error && !/duplicate|unique/i.test(error.message)) { alert(error.message); return; }
    setValue(''); load();
  };

  const remove = async (r) => {
    if (!confirm(`Unblock ${r.kind === 'domain' ? '@' + r.value : r.value}?\n\nTheir mail will create tickets again.`)) return;
    await supabase.from('blocked_senders').delete().eq('id', r.id);
    load();
  };

  const who = (id) => { const m = members.find(x => x.id === id); return m ? (m.display_name || m.email?.split('@')[0]) : '—'; };
  const input = "px-3 py-2 bg-card border border-bdr rounded-xl text-sm text-paper";

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-bdr">
        <div className="text-lg font-bold text-paper">Junk senders</div>
        <div className="text-[10px] text-dim font-mono uppercase tracking-[0.18em]">
          {rows.length} rule{rows.length === 1 ? '' : 's'} · mail from these never becomes a ticket
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-3xl">
        {canWrite && (
          <div className="glass-card rounded-2xl p-4">
            <div className="text-sm font-bold text-paper mb-2">Block a sender</div>
            <div className="flex flex-wrap gap-2">
              <select className={input} value={kind} onChange={e => setKind(e.target.value)}>
                <option value="email">This address</option>
                <option value="domain">Whole domain</option>
              </select>
              <input className={input + ' flex-1 min-w-[220px]'} value={value} onChange={e => setValue(e.target.value)}
                placeholder={kind === 'domain' ? 'example.com' : 'spammer@example.com'}
                onKeyDown={e => e.key === 'Enter' && add()} />
              <button disabled={busy} onClick={add} className="btn-glass px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50">Block</button>
            </div>
            <div className="text-[11px] text-dim mt-2">
              You can also hit <span className="text-paper font-semibold">Junk</span> on any ticket, which blocks the sender and closes it.
            </div>
          </div>
        )}

        <div className="glass-card rounded-2xl overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-dim italic">Nothing blocked yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-dim border-b border-bdr">
                  <th className="text-left px-4 py-2">Blocked</th>
                  <th className="text-left px-2 py-2">Reason</th>
                  <th className="text-right px-2 py-2">Caught</th>
                  <th className="text-left px-2 py-2">By</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-bdr/50">
                    <td className="px-4 py-2.5">
                      <div className="text-paper font-mono text-xs">{r.kind === 'domain' ? `@${r.value}` : r.value}</div>
                      {r.kind === 'domain' && <div className="text-[10px] text-amber">every sender at this domain</div>}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-muted">{r.reason || '—'}</td>
                    <td className="px-2 py-2.5 text-right">
                      <span className={`font-mono text-xs ${r.hits > 0 ? 'text-paper' : 'text-dim'}`}>{r.hits}</span>
                      {r.last_hit_at && <div className="text-[10px] text-dim">{new Date(r.last_hit_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-muted">{who(r.blocked_by)}</td>
                    <td className="px-2 py-2.5 text-center">
                      {canWrite && <button onClick={() => remove(r)} title="Unblock" className="text-muted hover:text-red-600">×</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
