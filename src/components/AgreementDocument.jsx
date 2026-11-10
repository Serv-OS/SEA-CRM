import { feasibilityBlocks, FEASIBILITY_TERMS, FEASIBILITY_CONSENT, KIND_LABEL, fmtDocDate, usd } from '../lib/agreements';

// The agreement as the client reads it, on the public link and in the CRM's
// preview. Light paper styling so it prints the same everywhere. `slots`
// renders under each signature line (a pad, or the drawn signature).
export default function AgreementDocument({ a, lines, total, seller, slots = {} }) {
  const blocks = feasibilityBlocks({ clientNames: a.client_names, propertyAddress: a.property_address });
  const accent = seller?.accent || '#b27b26';
  const sigLine = (label, who, key) => (
    <div className="flex-1 min-w-[220px]">
      <div className="min-h-[64px] flex items-end pb-2">
        {who?.signature_url ? <img src={who.signature_url} alt={`${label} signature`} className="max-h-16" /> : slots[key] || null}
      </div>
      <div className="border-t border-slate-400 pt-1 flex justify-between text-xs text-slate-600">
        <span>{label}{who?.name ? `: ${who.name}` : ''}</span>
        <span>{who?.signed_at ? fmtDocDate(who.signed_at) : 'Date'}</span>
      </div>
    </div>
  );

  return (
    <div className="bg-white text-slate-800 rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10 max-w-3xl mx-auto print:shadow-none print:border-0">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-2xl font-bold tracking-tight" style={{ color: accent }}>{(KIND_LABEL[a.kind] || 'Agreement').toUpperCase()}</div>
          <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 mt-1">INVESTIGATIVE DOCUMENTATION</div>
          <div className="text-sm text-slate-600 mt-2">{fmtDocDate(a.agreement_date)}</div>
        </div>
        {seller?.logo_url && <img src={seller.logo_url} alt={seller.name} className="max-h-14 max-w-[160px] object-contain" />}
      </div>

      <div className="space-y-3 text-[15px] leading-relaxed">
        {blocks.map((b, i) => (
          <div key={i}>
            {b.h && <div className="text-base font-bold mt-4" style={{ color: accent }}>{b.h}:</div>}
            {b.h2 && <div className="font-semibold mt-3">{b.h2}</div>}
            {b.p && <p>{b.p}</p>}
            {b.note && <p className="text-sm italic text-slate-600">{b.note}</p>}
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 overflow-hidden">
        {(lines || []).map((l, i) => (
          <div key={i} className="flex justify-between gap-3 px-4 py-2 text-sm border-b border-slate-100">
            <div>
              <div className="font-medium">{l.name || 'Item'}{Number(l.qty) !== 1 ? ` x ${Number(l.qty)}` : ''}</div>
              {l.description && <div className="text-xs text-slate-500 whitespace-pre-line">{l.description}</div>}
            </div>
            <div className="font-mono">{usd((Number(l.qty) || 0) * (Number(l.unit_price) || 0))}</div>
          </div>
        ))}
        <div className="flex justify-between px-4 py-3 bg-slate-50 font-bold">
          <span>Feasibility Agreement Fee total</span><span className="font-mono">{usd(total)}</span>
        </div>
      </div>
      <p className="text-sm mt-3">{FEASIBILITY_TERMS}</p>

      <p className="text-sm mt-8 font-medium">{FEASIBILITY_CONSENT}</p>
      <div className="mt-6 flex flex-wrap gap-x-10 gap-y-8">
        {sigLine('Client', a.client1, 'client1')}
        {sigLine('SEA Construction', a.seller, 'seller')}
        {a.client2_required && sigLine('Client', a.client2, 'client2')}
      </div>
    </div>
  );
}
