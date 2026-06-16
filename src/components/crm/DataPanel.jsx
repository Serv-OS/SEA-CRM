import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { parseCSV } from '../../lib/csv';

const TARGETS = {
  companies: {
    label: 'Companies',
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'domain', label: 'Domain' },
      { key: 'city', label: 'City' },
      { key: 'industry', label: 'Industry' },
      { key: 'phone', label: 'Phone' },
    ],
  },
  contacts: {
    label: 'Contacts',
    fields: [
      { key: 'first_name', label: 'First name' },
      { key: 'last_name', label: 'Last name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'job_title', label: 'Job title' },
      { key: 'company', label: 'Company (links/creates)' },
    ],
  },
};

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export default function DataPanel({ profile }) {
  const [tab, setTab] = useState('import');
  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-bdr">
        <div className="text-lg font-bold text-paper">Data tools</div>
        <div className="text-[10px] text-dim font-mono uppercase tracking-[0.18em]">Import data and clean up duplicates</div>
      </div>
      <div className="px-6 py-2 border-b border-bdr flex gap-1">
        {['import', 'duplicates'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition ${tab === t ? 'bg-card text-paper' : 'text-muted hover:text-paper'}`}>
            {t === 'import' ? 'Import CSV' : 'Find duplicates'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'import' ? <ImportTab profile={profile} /> : <DuplicatesTab profile={profile} />}
      </div>
    </div>
  );
}

/* ---------------- Import ---------------- */
function ImportTab({ profile }) {
  const [target, setTarget] = useState('companies');
  const [parsed, setParsed] = useState(null); // {headers, rows}
  const [mapping, setMapping] = useState({});
  const [skipDupes, setSkipDupes] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const canWrite = profile.role === 'owner' || profile.role === 'editor';
  const fields = TARGETS[target].fields;

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const p = parseCSV(text);
    setParsed(p);
    setResult(null);
    // auto-guess mapping
    const m = {};
    fields.forEach(f => {
      const hit = p.headers.find(h => norm(h) === norm(f.key) || norm(h) === norm(f.label) || norm(h).includes(norm(f.key)));
      if (hit) m[f.key] = hit;
    });
    setMapping(m);
  };

  const runImport = async () => {
    if (!parsed) return;
    setRunning(true);
    let imported = 0, skipped = 0, errors = 0;

    // Preload existing for dedupe + company linking
    const { data: existingCompanies } = await supabase.from('companies').select('id, name');
    const companyByName = new Map((existingCompanies || []).map(c => [norm(c.name), c.id]));
    let existingEmails = new Set();
    if (target === 'contacts') {
      const { data: ec } = await supabase.from('contacts').select('email');
      existingEmails = new Set((ec || []).map(c => (c.email || '').toLowerCase()).filter(Boolean));
    }

    for (const row of parsed.rows) {
      try {
        const get = (k) => mapping[k] ? (row[mapping[k]] || '').trim() : '';
        if (target === 'companies') {
          const name = get('name');
          if (!name) { skipped++; continue; }
          if (skipDupes && companyByName.has(norm(name))) { skipped++; continue; }
          const { error } = await supabase.from('companies').insert({
            name, domain: get('domain') || null, city: get('city') || null,
            industry: get('industry') || null, phone: get('phone') || null, owner_id: profile.id,
          });
          if (error) { errors++; continue; }
          companyByName.set(norm(name), true);
          imported++;
        } else {
          const email = get('email');
          const first = get('first_name'), last = get('last_name');
          if (!email && !first && !last) { skipped++; continue; }
          if (skipDupes && email && existingEmails.has(email.toLowerCase())) { skipped++; continue; }
          const { data: contact, error } = await supabase.from('contacts').insert({
            first_name: first || null, last_name: last || null, email: email || null,
            phone: get('phone') || null, job_title: get('job_title') || null, owner_id: profile.id,
          }).select('id').single();
          if (error) { errors++; continue; }
          if (email) existingEmails.add(email.toLowerCase());
          // Link/create company
          const coName = get('company');
          if (coName && contact) {
            let coId = companyByName.get(norm(coName));
            if (!coId || coId === true) {
              const { data: co } = await supabase.from('companies').insert({ name: coName, owner_id: profile.id }).select('id').single();
              coId = co?.id;
              if (coId) companyByName.set(norm(coName), coId);
            }
            if (coId && coId !== true) {
              await supabase.from('associations').insert({ from_type: 'contact', from_id: contact.id, to_type: 'company', to_id: coId, label: 'primary_contact' });
            }
          }
          imported++;
        }
      } catch { errors++; }
    }
    setRunning(false);
    setResult({ imported, skipped, errors, total: parsed.rows.length });
  };

  const input = "px-3 py-2 bg-card border border-bdr rounded-xl text-sm text-paper focus:outline-none focus:border-ember";

  return (
    <div className="max-w-3xl space-y-4">
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <label className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-dim mb-1 block">Import into</label>
            <select className={input} value={target} onChange={e => { setTarget(e.target.value); setParsed(null); setResult(null); }}>
              <option value="companies">Companies</option>
              <option value="contacts">Contacts</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-dim mb-1 block">CSV file</label>
            <input type="file" accept=".csv,text/csv" onChange={onFile} disabled={!canWrite}
              className="text-sm text-paper file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-ember file:text-white file:text-sm file:font-semibold" />
          </div>
        </div>
        <div className="text-[11px] text-dim">First row must be column headers. We'll try to match them automatically — adjust the mapping below.</div>
      </div>

      {parsed && parsed.rows.length > 0 && (
        <div className="glass-card rounded-2xl p-5 space-y-3">
          <div className="text-sm font-bold text-paper">Map columns ({parsed.rows.length} rows)</div>
          <div className="space-y-2">
            {fields.map(f => (
              <div key={f.key} className="flex items-center gap-3">
                <div className="w-44 text-sm text-paper">{f.label}{f.required && <span className="text-ember"> *</span>}</div>
                <select className={input + ' flex-1'} value={mapping[f.key] || ''} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}>
                  <option value="">— Skip —</option>
                  {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <div className="w-40 text-[11px] text-dim truncate">{mapping[f.key] ? `e.g. ${parsed.rows[0][mapping[f.key]] || ''}` : ''}</div>
              </div>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-paper pt-1 cursor-pointer">
            <input type="checkbox" checked={skipDupes} onChange={e => setSkipDupes(e.target.checked)} />
            Skip rows that already exist ({target === 'companies' ? 'by name' : 'by email'})
          </label>
          <div className="flex items-center gap-3">
            <button onClick={runImport} disabled={running || (target === 'companies' && !mapping.name)}
              className="btn-glass px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50">
              {running ? 'Importing…' : `Import ${parsed.rows.length} rows`}
            </button>
            {target === 'companies' && !mapping.name && <span className="text-xs text-amber-600">Map the Name column to continue</span>}
          </div>
        </div>
      )}

      {result && (
        <div className="glass-card rounded-2xl p-5">
          <div className="text-sm font-bold text-paper mb-2">Import complete</div>
          <div className="flex gap-6 text-sm">
            <div><span className="text-emerald-600 font-bold text-lg">{result.imported}</span> <span className="text-muted">imported</span></div>
            <div><span className="text-amber-600 font-bold text-lg">{result.skipped}</span> <span className="text-muted">skipped</span></div>
            <div><span className="text-red-600 font-bold text-lg">{result.errors}</span> <span className="text-muted">errors</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Duplicates ---------------- */
function DuplicatesTab({ profile }) {
  const [target, setTarget] = useState('companies');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);
  const [keepers, setKeepers] = useState({}); // groupKey -> id

  const canWrite = profile.role === 'owner' || profile.role === 'editor';

  useEffect(() => { detect(); }, [target]);

  const label = (r) => target === 'companies'
    ? r.name
    : ([r.first_name, r.last_name].filter(Boolean).join(' ') || r.email);
  const sub = (r) => target === 'companies' ? (r.domain || r.city || '') : (r.email || r.phone || '');

  const detect = async () => {
    setLoading(true);
    const { data } = target === 'companies'
      ? await supabase.from('companies').select('id, name, domain, city, created_at')
      : await supabase.from('contacts').select('id, first_name, last_name, email, phone, created_at');
    const records = data || [];
    const map = {};
    records.forEach(r => {
      const key = target === 'companies' ? norm(r.name) : (r.email || '').toLowerCase().trim();
      if (!key) return;
      (map[key] = map[key] || []).push(r);
    });
    const g = Object.entries(map).filter(([, arr]) => arr.length > 1)
      .map(([key, arr]) => ({ key, records: arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) }));
    setGroups(g);
    const k = {};
    g.forEach(grp => { k[grp.key] = grp.records[0].id; });
    setKeepers(k);
    setLoading(false);
  };

  const mergeGroup = async (grp) => {
    const keepId = keepers[grp.key];
    if (!keepId) return;
    if (!confirm(`Merge ${grp.records.length - 1} duplicate(s) into the selected record? This cannot be undone.`)) return;
    setMerging(true);
    const fn = target === 'companies' ? 'merge_companies' : 'merge_contacts';
    for (const r of grp.records) {
      if (r.id === keepId) continue;
      const { error } = await supabase.rpc(fn, { keep_id: keepId, dup_id: r.id });
      if (error) { alert('Merge failed: ' + error.message); break; }
    }
    setMerging(false);
    detect();
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <select className="px-3 py-2 bg-card border border-bdr rounded-xl text-sm text-paper focus:outline-none focus:border-ember"
          value={target} onChange={e => setTarget(e.target.value)}>
          <option value="companies">Companies (by name)</option>
          <option value="contacts">Contacts (by email)</option>
        </select>
        <div className="text-sm text-muted">{loading ? 'Scanning…' : `${groups.length} duplicate group${groups.length !== 1 ? 's' : ''} found`}</div>
      </div>

      {!loading && groups.length === 0 && (
        <div className="glass-card rounded-2xl p-8 text-center text-dim text-sm">No duplicates found. 🎉</div>
      )}

      {groups.map(grp => (
        <div key={grp.key} className="glass-card rounded-2xl p-4">
          <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-dim mb-2">{grp.records.length} matches</div>
          <div className="space-y-1.5 mb-3">
            {grp.records.map(r => (
              <label key={r.id} className="flex items-center gap-2 p-2 glass-inner rounded-xl cursor-pointer">
                <input type="radio" name={`keep-${grp.key}`} checked={keepers[grp.key] === r.id}
                  onChange={() => setKeepers(k => ({ ...k, [grp.key]: r.id }))} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-paper truncate">{label(r)}</div>
                  <div className="text-[10px] text-dim truncate">{sub(r)} · added {new Date(r.created_at).toLocaleDateString('en-US')}</div>
                </div>
                {keepers[grp.key] === r.id && <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-bold uppercase">Keep</span>}
              </label>
            ))}
          </div>
          {canWrite && (
            <button onClick={() => mergeGroup(grp)} disabled={merging}
              className="px-3 py-1.5 text-xs font-semibold bg-ember text-white rounded-xl hover:bg-ember-deep disabled:opacity-50">
              Merge into selected
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
