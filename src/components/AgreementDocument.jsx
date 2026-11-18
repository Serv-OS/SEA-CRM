import { kindOf, fmtDocDate, usd } from '../lib/agreements';

// The agreement as the client reads it, on the public link and in the CRM's
// preview. Light paper styling so it prints the same everywhere. `slots`
// renders under each signature line (a pad, or the drawn signature). The
// wording, headings and labels for each kind come from KINDS in lib/agreements.
export default function AgreementDocument({ a, lines, total, seller, slots = {} }) {
  const k = kindOf(a);
  const blocks = k.blocks(a, total);
  const d = a.details || {};
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

  // The fee lines: inside the wording for a design build, after it for a feasibility.
  const feeBox = (
      <div className="my-4 rounded-xl border border-slate-200 overflow-hidden">
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
          <span>{k.feeLabel}</span><span className="font-mono">{usd(total)}</span>
        </div>
      </div>
  );

  return (
    <div className="bg-white text-slate-800 rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10 max-w-3xl mx-auto print:shadow-none print:border-0">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-2xl font-bold tracking-tight" style={{ color: accent }}>{k.title}</div>
          <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 mt-1">{k.subtitle}</div>
          <div className="text-sm text-slate-600 mt-2">{k.longDate && a.agreement_date ? new Date(`${String(a.agreement_date).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : fmtDocDate(a.agreement_date)}</div>
        </div>
        {seller?.logo_url && <img src={seller.logo_url} alt={seller.name} className="max-h-14 max-w-[160px] object-contain" />}
      </div>

      <div className="space-y-3 text-[15px] leading-relaxed">
        {blocks.map((b, i) => (
          <div key={i}>
            {b.h && <div className="text-base font-bold mt-4" style={{ color: accent }}>{b.h}:</div>}
            {b.h2 && <div className="font-semibold mt-3">{b.n ? `${b.n}. ` : ''}{b.h2}</div>}
            {b.parties && (
              <div className="grid sm:grid-cols-2 gap-4 text-sm rounded-xl border border-slate-200 p-4">
                <div><div className="text-slate-500 text-xs uppercase tracking-wide mb-1">Contractor</div>S.E.A. Construction Inc.<br />763 Polhemus Rd.<br />San Mateo, CA 94402<br />License #563320</div>
                <div><div className="text-slate-500 text-xs uppercase tracking-wide mb-1">Property Owners</div>{b.parties.owners}<br /><span className="whitespace-pre-line">{b.parties.where}</span></div>
              </div>
            )}
            {b.p && <p>{b.p}</p>}
            {b.pre && <p className="whitespace-pre-line">{b.pre}</p>}
            {b.note && <p className="text-sm italic text-slate-600">{b.note}</p>}
            {b.ul && <ul className="list-disc pl-5 space-y-1.5">{b.ul.map((li, j) => <li key={j}>{li}</li>)}</ul>}
            {b.fee && feeBox}
            {/* Owners' initials on every initialled clause, typed once when they sign. */}
            {b.initials && (
              <div className="text-xs text-slate-500 flex gap-6 pt-1">
                <span>Initials: <span className="font-semibold text-slate-700 inline-block min-w-[2.5rem] border-b border-slate-300 text-center">{a.client1_initials || ''}</span></span>
                {a.client2_required && <span className="font-semibold text-slate-700 inline-block min-w-[2.5rem] border-b border-slate-300 text-center">{a.client2_initials || ''}</span>}
              </div>
            )}
          </div>
        ))}
      </div>


      {!k.feeInline && <div className="mt-8">{feeBox}</div>}
      {k.terms && <p className="text-sm mt-3">{k.terms}</p>}

      <p className="text-sm mt-8 font-medium">{k.consent}</p>
      <div className="mt-6 flex flex-wrap gap-x-10 gap-y-8">
        {sigLine(k.clientLabel, a.client1, 'client1')}
        {sigLine(k.sellerLabel, a.seller, 'seller')}
        {a.client2_required && sigLine(k.clientLabel, a.client2, 'client2')}
      </div>
      {k.contactBlock && (
        <div className="mt-8 grid sm:grid-cols-3 gap-4 text-sm">
          <div className="sm:col-span-3"><span className="text-slate-500">Mailing Address: </span>{d.mailing_address || a.property_address || ''}</div>
          <div><span className="text-slate-500">Phone: </span>{d.client_phone || ''}</div>
          <div className="sm:col-span-2"><span className="text-slate-500">Email: </span>{d.client_email || ''}</div>
        </div>
      )}
    </div>
  );
}
