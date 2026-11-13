import { useEffect, useState } from 'react';

// A large writing window for the scope of work (Peter, 13 Nov 2026: the card
// box was far too small to see what you are writing). Opens over the page,
// most of the screen tall, readable type, and grows with the text.
export default function ScopeEditor({ title = 'Scope of work', caption, value, saveLabel = 'Save scope', onSave, onClose }) {
  const [body, setBody] = useState(value || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setBody(value || ''); }, [value]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    if (!body.trim()) { alert('Type the scope of work first.'); return; }
    setSaving(true);
    try { await onSave?.(body); } finally { setSaving(false); }
  };

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 sm:p-8" onClick={onClose}>
      <div className="glass-card rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-bdr flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-paper">{title}</div>
            {caption && <div className="text-xs text-muted mt-0.5">{caption}</div>}
          </div>
          <button onClick={onClose} className="btn-ghost px-4 py-2 rounded-xl text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 text-sm font-semibold rounded-xl bg-ember text-white hover:bg-ember-deep disabled:opacity-50">{saving ? 'Saving…' : saveLabel}</button>
        </div>
        <textarea autoFocus value={body} onChange={e => setBody(e.target.value)}
          placeholder={'What the work covers. One item per line reads best, for example:\n\nKitchen remodel\nRemove the wall between the kitchen and dining room\nNew island with seating for four\nReplace all cabinets, counters and appliances'}
          className="flex-1 w-full px-6 py-5 bg-card text-paper placeholder-dim text-base leading-relaxed font-sans resize-none focus:outline-none" />
        <div className="px-6 py-2 border-t border-bdr text-[11px] text-dim flex justify-between">
          <span>{words} words · {body.split('\n').length} lines</span>
          <span>Esc to cancel</span>
        </div>
      </div>
    </div>
  );
}
