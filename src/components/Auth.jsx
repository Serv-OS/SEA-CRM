import { useState } from 'react';
import { supabase, APP_URL } from '../lib/supabase';
import { LogoMark, Wordmark } from './ServOSLogo.jsx';

export default function Auth() {
  const [email, setEmail]     = useState('');
  const [code, setCode]       = useState('');
  const [step, setStep]       = useState('email'); // 'email' | 'code'
  const [error, setError]     = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    setSending(true); setError('');
    // Sends an email containing BOTH a 6-digit code and a link.
    // In the installed app you type the code (no browser hop); on desktop the link still works.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: APP_URL },
    });
    setSending(false);
    if (error) setError(error.message); else setStep('code');
  };

  const verify = async (e) => {
    e.preventDefault();
    setVerifying(true); setError('');
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
    setVerifying(false);
    if (error) setError(error.message);
    // On success, onAuthStateChange in App swaps to the Shell.
  };

  return (
    <div className="h-full flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8 flex flex-col items-center">
          <LogoMark size={56}/>
          <div className="mt-4"><Wordmark className="!text-4xl"/></div>
          <div className="text-sm mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">CRM</div>
        </div>

        {step === 'code' ? (
          <form onSubmit={verify} className="glass-raised glass-shimmer rounded-3xl p-8 space-y-4">
            <div className="text-center">
              <div className="text-3xl mb-2">&#x2709;&#xFE0F;</div>
              <div className="text-base font-semibold mb-1">Enter your code</div>
              <div className="text-sm text-muted">We emailed a 6-digit code to <span className="font-medium text-ink">{email}</span></div>
            </div>
            <input
              type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus
              value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000" maxLength={6}
              className="w-full px-4 py-3 rounded-2xl text-center text-2xl font-mono tracking-[0.4em] focus:outline-none glass-card placeholder-dim"
            />
            <button type="submit" disabled={verifying || code.length < 6}
              className="w-full px-4 py-3 btn-glass rounded-2xl text-sm disabled:opacity-50">
              {verifying ? 'Verifying...' : 'Verify & sign in'}
            </button>
            {error && <div className="text-xs text-red-500 text-center">{error}</div>}
            <div className="flex items-center justify-between text-xs text-muted pt-1">
              <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); }} className="hover:text-ink">&larr; Change email</button>
              <button type="button" onClick={send} disabled={sending} className="hover:text-ink">{sending ? 'Sending...' : 'Resend code'}</button>
            </div>
          </form>
        ) : (
          <form onSubmit={send} className="glass-raised glass-shimmer rounded-3xl p-8 space-y-4">
            <input
              type="email" required autoFocus
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 rounded-2xl text-sm focus:outline-none glass-card placeholder-dim"
            />
            <button type="submit" disabled={sending || !email}
              className="w-full px-4 py-3 btn-glass rounded-2xl text-sm disabled:opacity-50">
              {sending ? 'Sending...' : 'Email me a sign-in code'}
            </button>
            {error && <div className="text-xs text-red-500 text-center">{error}</div>}
            <div className="text-xs text-muted text-center pt-1">
              First user becomes owner. Subsequent users must be invited by an owner.
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
