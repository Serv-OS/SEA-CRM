import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// My Account: a user sets their own contact details + notification preferences.
// Email notifications go to profile.email; SMS notifications go to profile.mobile.
export default function AccountPanel({ profile, onSaved }) {
  const [form, setForm] = useState({ display_name: '', phone: '', mobile: '' });
  const [prefs, setPrefs] = useState({
    email_enabled: true,
    sms_enabled: false,
    notify_on_mention: true,
    notify_on_assignment: true,
    notify_on_reply: true,
    quiet_hours_start: '',
    quiet_hours_end: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, [profile.id]);

  const load = async () => {
    setLoading(true);
    const [p, np] = await Promise.all([
      supabase.from('profiles').select('display_name, phone, mobile, email').eq('id', profile.id).single(),
      supabase.from('notification_preferences').select('*').eq('profile_id', profile.id).maybeSingle(),
    ]);
    if (p.data) {
      setForm({
        display_name: p.data.display_name || '',
        phone: p.data.phone || '',
        mobile: p.data.mobile || '',
      });
    }
    if (np.data) {
      setPrefs({
        email_enabled: np.data.email_enabled,
        sms_enabled: np.data.sms_enabled,
        notify_on_mention: np.data.notify_on_mention,
        notify_on_assignment: np.data.notify_on_assignment,
        notify_on_reply: np.data.notify_on_reply,
        quiet_hours_start: np.data.quiet_hours_start ? np.data.quiet_hours_start.slice(0, 5) : '',
        quiet_hours_end: np.data.quiet_hours_end ? np.data.quiet_hours_end.slice(0, 5) : '',
      });
    }
    setLoading(false);
  };

  const normalizePhone = (v) => v.replace(/[^\d+]/g, '');

  const save = async () => {
    setError('');
    setSaving(true);
    setSaved(false);

    // Warn (don't block) if SMS is on but no mobile saved
    const mobile = normalizePhone(form.mobile);
    if (prefs.sms_enabled && !mobile) {
      setError('Add a mobile number to receive SMS notifications.');
      setSaving(false);
      return;
    }

    const { error: pErr } = await supabase.from('profiles').update({
      display_name: form.display_name.trim() || null,
      phone: normalizePhone(form.phone) || null,
      mobile: mobile || null,
    }).eq('id', profile.id);

    if (pErr) { setError('Could not save profile: ' + pErr.message); setSaving(false); return; }

    const { error: npErr } = await supabase.from('notification_preferences').upsert({
      profile_id: profile.id,
      email_enabled: prefs.email_enabled,
      sms_enabled: prefs.sms_enabled,
      notify_on_mention: prefs.notify_on_mention,
      notify_on_assignment: prefs.notify_on_assignment,
      notify_on_reply: prefs.notify_on_reply,
      quiet_hours_start: prefs.quiet_hours_start || null,
      quiet_hours_end: prefs.quiet_hours_end || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'profile_id' });

    if (npErr) { setError('Could not save preferences: ' + npErr.message); setSaving(false); return; }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    onSaved?.();
  };

  const input = "w-full px-3 py-2 bg-card border border-bdr rounded-xl text-sm text-paper placeholder-dim focus:outline-none focus:border-ember";
  const label = "text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-dim mb-1 block";

  if (loading) return <div className="h-full flex items-center justify-center text-dim text-sm">Loading account...</div>;

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-5 border-b border-bdr">
        <div className="text-xl font-bold text-paper">My Account</div>
        <div className="text-xs text-muted">Your contact details and notification preferences</div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-6">

          {/* Contact details */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-bdr">
              <div className="text-base font-bold text-paper">Contact details</div>
              <div className="text-xs text-muted">Where the system reaches you</div>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={label}>Display name</label>
                <input className={input} value={form.display_name}
                  onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="Your name" />
              </div>

              <div>
                <label className={label}>Login / notification email</label>
                <input className={input + ' opacity-60 cursor-not-allowed'} value={profile.email} disabled />
                <div className="text-[11px] text-dim mt-1">Email notifications are sent here. Contact an owner to change your login email.</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label}>Mobile (for SMS)</label>
                  <input className={input} value={form.mobile}
                    onChange={e => setForm({ ...form, mobile: e.target.value })} placeholder="+447700900123" />
                  <div className="text-[11px] text-dim mt-1">Use international format, e.g. +44...</div>
                </div>
                <div>
                  <label className={label}>Phone (optional)</label>
                  <input className={input} value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Desk / landline" />
                </div>
              </div>
            </div>
          </div>

          {/* Notification preferences */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-bdr">
              <div className="text-base font-bold text-paper">Notifications</div>
              <div className="text-xs text-muted">Choose how and when you get notified</div>
            </div>
            <div className="p-5 space-y-5">

              {/* Channels */}
              <div>
                <div className={label}>Channels</div>
                <div className="space-y-2 mt-2">
                  <Toggle label="Email notifications" sub={profile.email}
                    checked={prefs.email_enabled} onChange={v => setPrefs({ ...prefs, email_enabled: v })} />
                  <Toggle label="SMS notifications" sub={form.mobile || 'No mobile number set'}
                    checked={prefs.sms_enabled} onChange={v => setPrefs({ ...prefs, sms_enabled: v })} />
                </div>
              </div>

              {/* Events */}
              <div>
                <div className={label}>Notify me when</div>
                <div className="space-y-2 mt-2">
                  <Toggle label="I'm @mentioned" sub="Someone tags you in a note or activity"
                    checked={prefs.notify_on_mention} onChange={v => setPrefs({ ...prefs, notify_on_mention: v })} />
                  <Toggle label="A record is assigned to me" sub="Ticket, deal, task or onboarding"
                    checked={prefs.notify_on_assignment} onChange={v => setPrefs({ ...prefs, notify_on_assignment: v })} />
                  <Toggle label="A customer replies" sub="On a ticket you own"
                    checked={prefs.notify_on_reply} onChange={v => setPrefs({ ...prefs, notify_on_reply: v })} />
                </div>
              </div>

              {/* Quiet hours */}
              <div>
                <div className={label}>Quiet hours (optional)</div>
                <div className="text-[11px] text-dim mb-2">No notifications during this window. Leave blank for always-on.</div>
                <div className="flex items-center gap-3">
                  <div>
                    <span className="text-[10px] text-dim block mb-1">From</span>
                    <input type="time" className={input + ' w-32'} value={prefs.quiet_hours_start}
                      onChange={e => setPrefs({ ...prefs, quiet_hours_start: e.target.value })} />
                  </div>
                  <div>
                    <span className="text-[10px] text-dim block mb-1">To</span>
                    <input type="time" className={input + ' w-32'} value={prefs.quiet_hours_end}
                      onChange={e => setPrefs({ ...prefs, quiet_hours_end: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</div>}

          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving}
              className="btn-glass px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            {saved && <span className="text-sm text-emerald-600 font-medium">{'✓'} Saved</span>}
          </div>

        </div>
      </div>
    </div>
  );
}

function Toggle({ label, sub, checked, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-3 p-3 glass-inner rounded-xl text-left hover:border-bdr transition">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-paper">{label}</div>
        {sub && <div className="text-xs text-muted truncate">{sub}</div>}
      </div>
      <div className={`relative w-10 h-6 rounded-full transition shrink-0 ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </div>
    </button>
  );
}
