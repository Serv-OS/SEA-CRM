import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, X, Pencil } from 'lucide-react';

export default function DepartmentsView({ profile }) {
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [staff, setStaff] = useState([]);
  const [editDept, setEditDept] = useState(null);
  const [editArea, setEditArea] = useState(null);
  const canWrite = profile.role === 'owner' || profile.role === 'editor';

  useEffect(() => { load(); }, []);
  const load = async () => {
    const [d, a, p] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase.from('areas').select('*').order('name'),
      supabase.from('profiles').select('id, display_name, email, department_id'),
    ]);
    setDepartments(d.data || []); setAreas(a.data || []); setStaff(p.data || []);
  };

  const memberCount = (id) => staff.filter(s => s.department_id === id).length;
  const nameOf = (id) => { const p = staff.find(s => s.id === id); return p?.display_name || p?.email?.split('@')[0] || '—'; };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-5 border-b border-bdr">
        <div className="text-xl font-bold text-paper">Departments &amp; Areas</div>
        <div className="text-xs text-muted">Customise the structure your rota uses</div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Departments */}
          <Section title="Departments" onAdd={canWrite ? () => setEditDept({ name: '', colour: '#15C26A', lead_user_id: '' }) : null}>
            {departments.map(d => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3 border-t border-bdr first:border-t-0">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: d.colour }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-paper">{d.name}</div>
                  <div className="text-[11px] text-dim">Lead: {nameOf(d.lead_user_id)} · {memberCount(d.id)} member{memberCount(d.id) !== 1 ? 's' : ''}</div>
                </div>
                {canWrite && <button onClick={() => setEditDept(d)} className="text-dim hover:text-paper"><Pencil size={14} /></button>}
              </div>
            ))}
            {departments.length === 0 && <Empty>No departments</Empty>}
          </Section>

          {/* Areas */}
          <Section title="Areas" onAdd={canWrite ? () => setEditArea({ name: '', colour: '#7C5CFF', description: '', required_per_day: 1, allowed_department_ids: [] }) : null}>
            {areas.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3 border-t border-bdr first:border-t-0">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: a.colour }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-paper">{a.name} <span className="text-[11px] text-dim font-normal">· need {a.required_per_day}/day</span></div>
                  <div className="text-[11px] text-dim truncate">
                    {a.description || 'No description'}
                    {a.allowed_department_ids?.length ? ` · ${a.allowed_department_ids.map(id => departments.find(d => d.id === id)?.name).filter(Boolean).join(', ')}` : ' · all departments'}
                  </div>
                </div>
                {canWrite && <button onClick={() => setEditArea(a)} className="text-dim hover:text-paper"><Pencil size={14} /></button>}
              </div>
            ))}
            {areas.length === 0 && <Empty>No areas</Empty>}
          </Section>

        </div>
      </div>

      {editDept && <DeptModal dept={editDept} staff={staff} onClose={() => setEditDept(null)} onSaved={() => { setEditDept(null); load(); }} />}
      {editArea && <AreaModal area={editArea} departments={departments} onClose={() => setEditArea(null)} onSaved={() => { setEditArea(null); load(); }} />}
    </div>
  );
}

function Section({ title, onAdd, children }) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-bdr flex items-center justify-between">
        <h3 className="text-[13px] font-bold text-paper">{title}</h3>
        {onAdd && <button onClick={onAdd} className="text-xs text-ember hover:text-ember-deep font-medium flex items-center gap-1"><Plus size={13} /> Add</button>}
      </div>
      <div>{children}</div>
    </div>
  );
}
function Empty({ children }) { return <div className="px-4 py-6 text-center text-dim text-sm italic">{children}</div>; }

const input = "w-full px-3 py-2 bg-card border border-bdr rounded-xl text-sm text-paper focus:outline-none focus:border-ember";
const label = "text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-dim mb-1 block";

function Frame({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass-card rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-bdr flex items-center justify-between">
          <div className="text-base font-bold text-paper">{title}</div>
          <button onClick={onClose} className="text-muted hover:text-paper"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}
function ColourField({ value, onChange }) {
  return (
    <div><label className={label}>Colour</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-10 h-10 rounded-lg border border-bdr bg-card cursor-pointer shrink-0" />
        <input className={input} value={value} onChange={e => onChange(e.target.value)} />
      </div>
    </div>
  );
}

function DeptModal({ dept, staff, onClose, onSaved }) {
  const [f, setF] = useState({ name: dept.name || '', colour: dept.colour || '#15C26A', lead_user_id: dept.lead_user_id || '' });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.name.trim()) { alert('Name required'); return; }
    const row = { name: f.name.trim(), colour: f.colour, lead_user_id: f.lead_user_id || null };
    if (dept.id) await supabase.from('departments').update(row).eq('id', dept.id);
    else await supabase.from('departments').insert(row);
    onSaved();
  };
  return (
    <Frame title={dept.id ? 'Edit department' : 'Add department'} onClose={onClose}>
      <div><label className={label}>Name</label><input className={input} value={f.name} onChange={e => set('name', e.target.value)} autoFocus /></div>
      <ColourField value={f.colour} onChange={v => set('colour', v)} />
      <div><label className={label}>Lead</label>
        <select className={input} value={f.lead_user_id} onChange={e => set('lead_user_id', e.target.value)}>
          <option value="">No lead</option>{staff.map(s => <option key={s.id} value={s.id}>{s.display_name || s.email}</option>)}
        </select></div>
      <div className="flex gap-2"><button onClick={save} className="btn-glass px-5 py-2 rounded-xl text-sm font-semibold">Save</button>
        <button onClick={onClose} className="btn-ghost px-4 py-2 rounded-xl text-sm">Cancel</button></div>
    </Frame>
  );
}

function AreaModal({ area, departments, onClose, onSaved }) {
  const [f, setF] = useState({
    name: area.name || '', colour: area.colour || '#7C5CFF', description: area.description || '',
    required_per_day: area.required_per_day ?? 1, allowed_department_ids: area.allowed_department_ids || [],
  });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const toggleDept = (id) => set('allowed_department_ids', f.allowed_department_ids.includes(id) ? f.allowed_department_ids.filter(x => x !== id) : [...f.allowed_department_ids, id]);
  const save = async () => {
    if (!f.name.trim()) { alert('Name required'); return; }
    const row = { name: f.name.trim(), colour: f.colour, description: f.description.trim() || null, required_per_day: Number(f.required_per_day) || 1, allowed_department_ids: f.allowed_department_ids };
    if (area.id) await supabase.from('areas').update(row).eq('id', area.id);
    else await supabase.from('areas').insert(row);
    onSaved();
  };
  return (
    <Frame title={area.id ? 'Edit area' : 'Add area'} onClose={onClose}>
      <div><label className={label}>Name</label><input className={input} value={f.name} onChange={e => set('name', e.target.value)} autoFocus /></div>
      <ColourField value={f.colour} onChange={v => set('colour', v)} />
      <div><label className={label}>Description</label><input className={input} value={f.description} onChange={e => set('description', e.target.value)} /></div>
      <div><label className={label}>Required per day</label><input type="number" min="0" className={input} value={f.required_per_day} onChange={e => set('required_per_day', e.target.value)} /></div>
      <div><label className={label}>Allowed departments</label>
        <div className="flex flex-wrap gap-2">
          {departments.map(d => {
            const on = f.allowed_department_ids.includes(d.id);
            return <button key={d.id} onClick={() => toggleDept(d.id)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition ${on ? 'border-transparent text-white' : 'border-bdr text-muted'}`}
              style={on ? { background: d.colour } : {}}>{d.name}</button>;
          })}
        </div>
        <div className="text-[10px] text-dim mt-1">None selected = all departments can cover this area.</div>
      </div>
      <div className="flex gap-2"><button onClick={save} className="btn-glass px-5 py-2 rounded-xl text-sm font-semibold">Save</button>
        <button onClick={onClose} className="btn-ghost px-4 py-2 rounded-xl text-sm">Cancel</button></div>
    </Frame>
  );
}
