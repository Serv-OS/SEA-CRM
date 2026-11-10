import { useEffect, useRef, useState } from 'react';
import AgreementDocument from './AgreementDocument.jsx';
import SignaturePad from './SignaturePad.jsx';
import { cardFee, cardTotal, usd, fmtDocDate } from '../lib/agreements';

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

// The client's agreement link, /a/<token>: read, sign (one or two clients),
// then pay by card (card fee added) or by the payment details shown.
export default function PublicAgreement({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState({ 1: '', 2: '' });
  const pads = { 1: useRef(null), 2: useRef(null) };
  const justPaid = new URLSearchParams(window.location.search).get('paid') === '1';

  const load = async () => {
    try {
      const res = await fetch(`${FN}/agreement-public?token=${encodeURIComponent(token)}`);
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Agreement not found.'); return; }
      setData(d);
    } catch { setError('Could not load this agreement. Please check your connection and refresh.'); }
  };
  useEffect(() => { load(); }, [token]);
  // Card payments land a moment after Stripe sends the client back.
  useEffect(() => {
    if (!justPaid || !data || data.agreement.paid_at) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [justPaid, data]);

  const post = async (body) => {
    const res = await fetch(`${FN}/agreement-public`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...body }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
    return d;
  };

  const sign = async (slot) => {
    setError('');
    const name = names[slot].trim();
    const signature = pads[slot].current?.toDataURL();
    if (!name) { setError('Please type your full name.'); return; }
    if (!signature) { setError('Please draw your signature.'); return; }
    setBusy(true);
    try { await post({ action: 'sign', slot, name, signature }); await load(); }
    catch (e) { setError(e.message); }
    setBusy(false);
  };

  const payByCard = async () => {
    setError(''); setBusy(true);
    try { const d = await post({ action: 'pay', origin: window.location.origin }); window.location.href = d.url; }
    catch (e) { setError(e.message); setBusy(false); }
  };

  if (error && !data) return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-600">{error}</div>;
  if (!data) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400">Loading…</div>;

  const a = data.agreement;
  const accent = data.seller.accent;
  const needs = [1, ...(a.client2_required ? [2] : [])].filter(s => !a[`client${s}`].signed_at);
  const allSigned = needs.length === 0;
  const fee = cardFee(data.total, a.card_fee_percent);

  const signSlot = (slot) => needs[0] === slot ? (
    <div className="w-full space-y-2 print:hidden">
      <input value={names[slot]} onChange={e => setNames({ ...names, [slot]: e.target.value })} placeholder="Type your full name"
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
      <SignaturePad ref={pads[slot]} height={120} />
      <button disabled={busy} onClick={() => sign(slot)} className="w-full py-2.5 rounded-lg text-white font-semibold text-sm disabled:opacity-50" style={{ background: accent }}>
        {busy ? 'Saving…' : 'Sign agreement'}
      </button>
    </div>
  ) : null;

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4 print:bg-white print:p-0">
      <AgreementDocument a={a} lines={data.lines} total={data.total} seller={data.seller}
        slots={{ client1: signSlot(1), client2: signSlot(2) }} />

      <div className="max-w-3xl mx-auto mt-4 space-y-4 print:hidden">
        {error && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>}

        {!allSigned && a.client2_required && a.client1.signed_at && (
          <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 text-sm text-slate-600">Thank you, {a.client1.name}. The second client now signs above.</div>
        )}

        {allSigned && a.paid_at && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-5 py-4">
            <div className="font-bold text-emerald-800">Signed and paid. Thank you.</div>
            <div className="text-sm text-emerald-700 mt-1">{usd(a.amount_paid)} received {fmtDocDate(a.paid_at)}{a.card_fee_paid > 0 ? ` (plus ${usd(a.card_fee_paid)} card fee)` : ''}. We will be in touch to book your initial onsite meeting.</div>
          </div>
        )}

        {allSigned && !a.paid_at && justPaid && (
          <div className="rounded-2xl bg-white border border-slate-200 px-5 py-4 text-sm text-slate-600">Confirming your payment…</div>
        )}

        {allSigned && !a.paid_at && !justPaid && data.total > 0 && (
          <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
            <div className="font-bold text-slate-800">Pay the Feasibility Agreement Fee</div>
            <div className="text-sm text-slate-600">Your initial onsite meeting is booked once the fee is paid.</div>
            <div className="grid sm:grid-cols-2 gap-4">
              {data.card_payments && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold">Pay by card</div>
                  <div className="text-xs text-slate-500 mt-1">{usd(data.total)} + {usd(fee)} card processing fee ({a.card_fee_percent}%)</div>
                  <button disabled={busy} onClick={payByCard} className="mt-3 w-full py-2.5 rounded-lg text-white font-semibold text-sm disabled:opacity-50" style={{ background: accent }}>
                    {busy ? 'Opening…' : `Pay ${usd(cardTotal(data.total, a.card_fee_percent))}`}
                  </button>
                </div>
              )}
              {a.payment_details && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold">Pay by check or bank transfer, {usd(data.total)}</div>
                  <div className="text-sm text-slate-600 mt-1 whitespace-pre-line">{a.payment_details}</div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="text-center"><button onClick={() => window.print()} className="text-xs text-slate-500 hover:text-slate-700 underline">Print or save as PDF</button></div>
      </div>
    </div>
  );
}
