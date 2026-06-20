import { useState } from 'react';
import { supabase } from '../../lib/supabase';

// Button + modal that schedules a meeting on the user's Google Calendar and
// emails a Google invite to the attendees. Logs a meeting activity on the record.
export default function ScheduleMeeting({ subjectType, subjectId, contactId, attendeeEmail, defaultTitle, onScheduled, className }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle || 'Meeting');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState(30);
  const [attendees, setAttendees] = useState(attendeeEmail || '');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!date) { setError('Pick a date.'); return; }
    setBusy(true); setError('');
    const start = new Date(`${date}T${time}`);
    const end = new Date(start.getTime() + Number(duration) * 60000);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ms-calendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        title, description: notes, start: start.toISOString(), end: end.toISOString(),
        attendees: attendees.split(',').map(s => s.trim()).filter(Boolean),
        subject_type: subjectType, subject_id: subjectId, contact_id: contactId,
      }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error || 'Could not schedule.'); return; }
    setDone(true);
    onScheduled?.();
    setTimeout(() => { setOpen(false); setDone(false); }, 1500);
  };

  const input = "w-full px-3 py-2 bg-card border border-bdr rounded-xl text-sm text-paper placeholder-dim focus:outline-none focus:border-ember";
  const label = "text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-dim mb-1 block";

  return (
    <>
      <button onClick={() => setOpen(true)} className={className || 'px-3 py-2 text-sm rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200 transition'}>
        {'\u{1F4C5}'} Schedule
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md glass-card rounded-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
            {done ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl mx-auto mb-2">✓</div>
                <div className="text-base font-bold text-paper">Meeting scheduled</div>
                <div className="text-sm text-muted">A Google invite has been emailed.</div>
              </div>
            ) : (
              <>
                <div className="text-sm font-bold text-paper">Schedule a meeting</div>
                <div><label className={label}>Title</label><input className={input} value={title} onChange={e => setTitle(e.target.value)} autoFocus /></div>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className={label}>Date</label><input type="date" className={input} value={date} onChange={e => setDate(e.target.value)} /></div>
                  <div><label className={label}>Time</label><input type="time" className={input} value={time} onChange={e => setTime(e.target.value)} /></div>
                  <div><label className={label}>Mins</label>
                    <select className={input} value={duration} onChange={e => setDuration(e.target.value)}>
                      <option value={15}>15</option><option value={30}>30</option><option value={45}>45</option><option value={60}>60</option><option value={90}>90</option>
                    </select></div>
                </div>
                <div><label className={label}>Attendees (comma separated)</label><input className={input} value={attendees} onChange={e => setAttendees(e.target.value)} placeholder="customer@example.com" /></div>
                <div><label className={label}>Notes</label><textarea className={input + ' resize-none'} rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
                {error && <div className="text-xs text-red-600">{error}</div>}
                <div className="flex gap-2">
                  <button onClick={submit} disabled={busy} className="btn-glass px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50">{busy ? 'Scheduling…' : 'Schedule & send invite'}</button>
                  <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-muted border border-bdr rounded-xl">Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
