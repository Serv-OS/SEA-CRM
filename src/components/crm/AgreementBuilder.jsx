import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AgreementDocument from '../AgreementDocument.jsx';
import SignaturePad from '../SignaturePad.jsx';
import { agreementTotal, cardFee, cardTotal, usd, agreementStage, clientsSigned, KIND_LABEL, fmtDocDate } from '../../lib/agreements';

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const PAY_METHODS = { check: 'Check', bank_transfer: 'Bank transfer', other: 'Other' };
const personName = (c) => [c?.first_name, c?.last_name].filter(Boolean).join(' ');

// A stage agreement on a deal (migration 082). Staff fill the fee and details,
// get the link for the client, then Steve signs for SEA here. The wording and
// sums come from lib/agreements, the same ones the client's page uses.
export default function AgreementBuilder({ agreementId, profile, onClose, onNavigate }) {
  const [a, setA] = useState(null);
  const [loadedScope, setLoadedScope] = useState('');
  const [lines, setLines] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [location, setLocation] = useState(null);
  const [seller, setSeller] = useState(null);
  const [sigUrls, setSigUrls] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [payMethod, setPayMethod] = useState('check');
  const pad = useRef(null);

  const canWrite = profile.role === 'owner' || profile.role === 'editor';
  useEffect(() => { load(); }, [agreementId]);

  const load = async () => {
    const [{ data: ag }, { data: li }, { data: s }] = await Promise.all([
      supabase.from('agreements').select('*').eq('id', agreementId).single(),
      supabase.from('agreement_line_items').select('*').eq('agreement_id', agreementId).order('sort'),
      supabase.from('support_settings').select('business_name, quote_accent, logo_url, agreement_payment_details').eq('id', 1).maybeSingle(),
    ]);
    // Payment details come from Settings unless this agreement has its own.
    setA(ag && !ag.payment_details && s?.agreement_payment_details ? { ...ag, payment_details: s.agreement_payment_details } : ag); setLines(li || []);
    setLoadedScope(ag?.scope_of_work || '');
    setSeller({ name: s?.business_name, accent: s?.quote_accent || '#b27b26', logo_url: s?.logo_url });
    if (!ag) return;
    // The deal's people and property, to fill the client names and address.
    const { data: assoc } = ag.deal_id ? await supabase.from('associations').select('from_type, from_id, to_type, to_id, created_at')
      .or(`and(from_type.eq.deal,from_id.eq.${ag.deal_id}),and(to_type.eq.deal,to_id.eq.${ag.deal_id})`).order('created_at') : { data: [] };
    const other = (r, t) => (r.from_type === t ? r.from_id : r.to_type === t ? r.to_id : null);
    const cIds = [...new Set((assoc || []).map(r => other(r, 'contact')).filter(Boolean))];
    const lId = (assoc || []).map(r => other(r, 'location')).find(Boolean) || ag.location_id;
    const [{ data: cs }, { data: loc }] = await Promise.all([
      cIds.length ? supabase.from('contacts').select('id, first_name, last_name, email, phone').in('id', cIds) : Promise.resolve({ data: [] }),
      lId ? supabase.from('locations').select('id, name, address, city, state, postcode').eq('id', lId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const people = cIds.map(id => (cs || []).find(c => c.id === id)).filter(Boolean);
    setContacts(people);
    setLocation(loc || null);
    // A deal made from a lead links its contact a moment after the deal (and
    // so the agreement) exists. Fill anything still blank from the deal now;
    // it is saved with the next Save or Get link.
    if (!ag.client1_signed_at && ag.status !== 'void') {
      const [c1, c2] = people;
      const names = [c1, c2].filter(Boolean).map(personName).filter(Boolean).join(' and ');
      const addr = loc ? [loc.address, loc.city, [loc.state, loc.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
      setA(p => ({
        ...p,
        ...(!p.client_names && names ? { client_names: names, contact_id: c1?.id || null, second_contact_id: c2?.id || null, client2_required: !!c2 } : {}),
        ...(!p.property_address && addr ? { property_address: addr, location_id: loc.id } : {}),
      }));
    }
    const urls = {};
    for (const k of ['client1', 'client2', 'seller']) {
      const path = ag[`${k}_signature_path`];
      if (path) { const { data: u } = await supabase.storage.from('attachments').createSignedUrl(path, 3600); urls[k] = u?.signedUrl || null; }
    }
    setSigUrls(urls);
  };

  if (!a) return <div className="p-8 text-dim text-sm">Loading…</div>;

  // Once a client has signed, the price and wording are what they agreed to.
  const locked = !canWrite || !!a.client1_signed_at || a.status === 'void';
  const total = agreementTotal(lines);
  const set = (k, v) => setA(p => ({ ...p, [k]: v }));
  const setLine = (i, k, v) => setLines(p => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const fillFromDeal = () => {
    const [c1, c2] = contacts;
    const names = [c1, c2].filter(Boolean).map(personName).filter(Boolean).join(' and ');
    const addr = location ? [location.address, location.city, [location.state, location.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
    setA(p => ({ ...p, client_names: names || p.client_names, property_address: addr || p.property_address,
      contact_id: c1?.id || p.contact_id, second_contact_id: c2?.id || null, client2_required: !!c2, location_id: location?.id || p.location_id }));
  };

  const save = async (extra = {}) => {
    setSaving(true); setMsg('');
    const patch = {
      client_names: a.client_names || null, property_address: a.property_address || null, agreement_date: a.agreement_date,
      payment_details: a.payment_details || null, card_fee_percent: Number(a.card_fee_percent) || 0,
      client2_required: !!a.client2_required, contact_id: a.contact_id || null, second_contact_id: a.second_contact_id || null,
      location_id: a.location_id || null, total, updated_at: new Date().toISOString(), ...extra,
      ...(locked ? {} : { scope_of_work: a.scope_of_work || null }),
    };
    const { error } = await supabase.from('agreements').update(patch).eq('id', a.id);
    if (error) { setSaving(false); alert('Could not save the agreement:\n\n' + error.message); return false; }
    // A scope changed here is the deal's next version too, so every page shows the same one.
    if (!locked && a.deal_id && (a.scope_of_work || '').trim() && (a.scope_of_work || '').trim() !== loadedScope.trim()) {
      await supabase.rpc('add_deal_scope', { p_deal_id: a.deal_id, p_body: a.scope_of_work, p_agreement_id: a.id });
    }
    if (!locked) {
      const { error: de } = await supabase.from('agreement_line_items').delete().eq('agreement_id', a.id);
      const rows = lines.filter(l => (l.name || '').trim() || Number(l.unit_price))
        .map((l, i) => ({ agreement_id: a.id, name: (l.name || '').trim() || 'Item', description: l.description || null, qty: Number(l.qty) || 1, unit_price: Number(l.unit_price) || 0, sort: i }));
      const { error: ie } = de ? { error: de } : rows.length ? await supabase.from('agreement_line_items').insert(rows) : { error: null };
      if (ie) { setSaving(false); alert('The details saved but the fee lines did not:\n\n' + ie.message + '\n\nPress Save again.'); return false; }
    }
    setSaving(false); setMsg('Saved'); setTimeout(() => setMsg(''), 2000);
    await load();
    return true;
  };

  const link = `${window.location.origin}/a/${a.public_token}`;
  const getLink = async () => {
    if (!a.client_names?.trim() || !a.property_address?.trim()) { alert('Add the client names and the property address first.'); return; }
    if (total <= 0) { alert('Add the fee as a line item first.'); return; }
    const ok = await save(a.status === 'draft' ? { status: 'sent', sent_at: new Date().toISOString() } : {});
    if (!ok) return;
    try { await navigator.clipboard.writeText(link); alert('Agreement link copied. Paste it into your email or text to the client.'); }
    catch { prompt('Copy this link for the client:', link); }
  };

  const countersign = async () => {
    const signature = pad.current?.toDataURL();
    if (!signature) { alert('Draw the signature first.'); return; }
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${FN}/agreement-public`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      body: JSON.stringify({ action: 'countersign', agreement_id: a.id, name: a.seller_name, signature }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { alert(d.error || 'Could not save the signature.'); return; }
    load();
  };

  const markPaid = async () => {
    if (!confirm(`Mark ${usd(total)} as paid by ${PAY_METHODS[payMethod].toLowerCase()}?`)) return;
    await save({ paid_at: new Date().toISOString(), amount_paid: total, card_fee_paid: 0, paid_method: payMethod });
  };
  const voidIt = async () => {
    if (!confirm('Void this agreement? The client link stops working.')) return;
    await save({ status: 'void' });
  };

  const input = 'w-full px-3 py-2 bg-card border border-bdr rounded-xl text-sm text-paper placeholder-dim focus:outline-none focus:border-ember disabled:opacity-60';
  const label = 'text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-dim mb-1 block';
  const docData = {
    ...a,
    client1: { name: a.client1_name, signed_at: a.client1_signed_at, signature_url: sigUrls.client1 },
    client2: { name: a.client2_name, signed_at: a.client2_signed_at, signature_url: sigUrls.client2 },
    seller: { name: a.seller_name, signed_at: a.seller_signed_at, signature_url: sigUrls.seller },
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-bdr flex items-center gap-3 flex-wrap">
        <button onClick={() => (a.deal_id ? onNavigate?.('deal', a.deal_id) : onClose?.())} className="text-muted hover:text-paper text-lg">&larr;</button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-xl font-bold text-paper">{KIND_LABEL[a.kind] || 'Agreement'}</div>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-slate-100 text-slate-600 border border-slate-200">{agreementStage(a)}</span>
          </div>
          <div className="text-xs text-muted mt-0.5">{a.client_names || 'No clients yet'}{a.deal_id && <> · <button onClick={() => onNavigate?.('deal', a.deal_id)} className="text-ember hover:underline">Open deal</button></>}</div>
        </div>
        {canWrite && a.status !== 'void' && (
          <div className="flex items-center gap-2">
            {msg && <span className="text-sm text-emerald-600 font-medium">✓ {msg}</span>}
            <button onClick={() => save()} disabled={saving} className="btn-glass px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={getLink} className="px-4 py-2 text-sm font-semibold rounded-xl bg-ember text-white hover:bg-ember-deep">{a.status === 'draft' ? 'Get link for client' : 'Copy client link'}</button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-12 gap-4 max-w-[1400px]">
          <div className="col-span-12 lg:col-span-5 space-y-4">
            <div className="glass-card rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-paper">Client details</h3>
                {!locked && <button onClick={fillFromDeal} className="text-xs text-ember hover:text-ember-deep font-medium">Fill from the deal</button>}
              </div>
              <div className="text-[11px] text-dim">
                Deal contacts: {contacts.length ? contacts.map(personName).join(', ') : 'none linked yet'} · Property: {location?.name || location?.address || 'none linked yet'}
              </div>
              <div><label className={label}>Client names</label><input className={input} disabled={locked} value={a.client_names || ''} onChange={e => set('client_names', e.target.value)} placeholder="Andy and Jessie Tohmc" /></div>
              <div><label className={label}>Property address</label><input className={input} disabled={locked} value={a.property_address || ''} onChange={e => set('property_address', e.target.value)} placeholder="1309 Bel Air Rd, San Mateo, CA 94402" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Agreement date</label><input type="date" className={input} disabled={locked} value={a.agreement_date || ''} onChange={e => set('agreement_date', e.target.value)} /></div>
                <label className="flex items-end gap-2 text-sm text-paper pb-2 cursor-pointer">
                  <input type="checkbox" disabled={locked} checked={!!a.client2_required} onChange={e => set('client2_required', e.target.checked)} className="accent-ember" /> Second client signs
                </label>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-4 space-y-2">
              <h3 className="text-sm font-bold text-paper">Scope of work</h3>
              <div className="text-[11px] text-dim">Printed on the agreement under the opening line. Filled from the deal; a change here is saved on the deal as the next version.</div>
              <textarea rows={5} className={input + ' resize-none'} disabled={locked} value={a.scope_of_work || ''} onChange={e => set('scope_of_work', e.target.value)}
                placeholder="What the work covers" />
            </div>

            <div className="glass-card rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-paper">Fee</h3>
              {lines.map((l, i) => (
                <div key={i} className="glass-inner rounded-xl p-3 space-y-2">
                  <div className="flex gap-2">
                    <input className={input} disabled={locked} value={l.name || ''} onChange={e => setLine(i, 'name', e.target.value)} placeholder="Feasibility Agreement Fee" />
                    {!locked && <button onClick={() => setLines(p => p.filter((_, j) => j !== i))} className="text-xs text-red-600 px-2">Remove</button>}
                  </div>
                  <input className={input + ' text-xs'} disabled={locked} value={l.description || ''} onChange={e => setLine(i, 'description', e.target.value)} placeholder="Description (optional, shown to the client)" />
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className={label}>Qty</label><input type="number" min="0" className={input} disabled={locked} value={l.qty ?? 1} onChange={e => setLine(i, 'qty', e.target.value)} /></div>
                    <div><label className={label}>Price ($)</label><input type="number" min="0" step="0.01" className={input} disabled={locked} value={l.unit_price ?? 0} onChange={e => setLine(i, 'unit_price', e.target.value)} /></div>
                  </div>
                </div>
              ))}
              {!locked && <button onClick={() => setLines(p => [...p, { name: '', description: '', qty: 1, unit_price: 0 }])} className="text-xs text-ember hover:text-ember-deep font-medium">+ Add line</button>}
              <div className="flex justify-between text-sm font-bold text-paper pt-2 border-t border-bdr"><span>Fee</span><span className="font-mono">{usd(total)}</span></div>
              <div className="flex justify-between text-xs text-muted"><span>Paid by card ({a.card_fee_percent}% card fee {usd(cardFee(total, a.card_fee_percent))})</span><span className="font-mono">{usd(cardTotal(total, a.card_fee_percent))}</span></div>
              <div><label className={label}>Card fee %</label><input type="number" min="0" max="10" step="0.1" className={input + ' !w-28'} disabled={locked} value={a.card_fee_percent ?? 1.4} onChange={e => set('card_fee_percent', e.target.value)} /></div>
              {locked && a.client1_signed_at && <div className="text-[11px] text-dim italic">The client has signed, so the fee and details are fixed.</div>}
            </div>

            <div className="glass-card rounded-2xl p-4 space-y-2">
              <h3 className="text-sm font-bold text-paper">Payment details</h3>
              <div className="text-[11px] text-dim">Shown to the client next to Pay by card. Filled from Settings, Agreement payment details; change it here for this agreement only.</div>
              <textarea rows={4} className={input + ' resize-none'} disabled={!canWrite || !!a.paid_at} value={a.payment_details || ''} onChange={e => set('payment_details', e.target.value)}
                placeholder={'Checks payable to SEA Construction\nBank: ...  Routing: ...  Account: ...'} />
            </div>

            <div className="glass-card rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-paper">Payment</h3>
              {a.paid_at ? (
                <div className="text-sm text-emerald-700">Paid {usd(a.amount_paid)} by {a.paid_method === 'card' ? 'card' : (PAY_METHODS[a.paid_method] || 'other').toLowerCase()} on {fmtDocDate(a.paid_at)}{a.card_fee_paid > 0 ? `, plus ${usd(a.card_fee_paid)} card fee` : ''}.</div>
              ) : (
                <>
                  <div className="text-xs text-muted">{clientsSigned(a) ? 'Signed, waiting for payment.' : 'Not paid yet.'} Card payments mark themselves paid. Paid another way? Record it here.</div>
                  {canWrite && a.status !== 'void' && (
                    <div className="flex gap-2">
                      <select className={input + ' !w-44'} value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                        {Object.entries(PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <button onClick={markPaid} className="px-3 py-2 text-sm font-semibold rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-200">Mark paid</button>
                    </div>
                  )}
                </>
              )}
            </div>

            {canWrite && a.status !== 'void' && !a.seller_signed_at && (
              <div className="glass-card rounded-2xl p-4 space-y-2">
                <h3 className="text-sm font-bold text-paper">Sign for SEA</h3>
                <div><label className={label}>Signing as</label><input className={input} value={a.seller_name || ''} onChange={e => set('seller_name', e.target.value)} /></div>
                <SignaturePad ref={pad} height={120} />
                <button onClick={countersign} className="px-4 py-2 text-sm font-semibold rounded-xl bg-ember text-white">Sign as {a.seller_name || 'SEA'}</button>
              </div>
            )}

            {canWrite && a.status !== 'void' && !a.paid_at && (
              <button onClick={voidIt} className="text-xs text-red-600 hover:underline">Void this agreement</button>
            )}
            {a.status !== 'draft' && a.status !== 'void' && (
              <div className="text-[11px] text-dim break-all">Client link: {link}</div>
            )}
          </div>

          <div className="col-span-12 lg:col-span-7">
            <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-dim mb-2">What the client sees</div>
            <AgreementDocument a={docData} lines={lines} total={total} seller={seller} />
          </div>
        </div>
      </div>
    </div>
  );
}
