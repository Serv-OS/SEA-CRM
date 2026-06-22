import { useState, useEffect } from 'react';
import { supabase, APP_URL } from '../lib/supabase';
import { LogoMark, Wordmark } from './ServOSLogo.jsx';

// Login. Primary = email + password (no email delivery needed). Fallback = a
// one-time email link/code (only works once custom SMTP is configured).
export default function Auth() {
  const [branding, setBranding] = useState(null);
  useEffect(() => {
    supabase.from('public_branding').select('*').maybeSingle()
      .then(({ data }) => setBranding(data || {}));
  }, []);

  const [mode, setMode]   = useState('password'); // 'password' | 'link' | 'code'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode]   = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(false);

  const signInPassword = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    // Success → onAuthStateChange in App swaps to the Shell.
    if (error) setError(error.message === 'Invalid login credentials'
      ? 'Wrong email or password. If you have never set a password, use “Email me a sign-in link” below.'
      : error.message);
  };

  const sendLink = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: APP_URL } });
    setBusy(false);
    if (error) setError(error.message); else setMode('code');
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError(error.message);
  };

  const field = "w-full px-4 py-3 rounded-2xl text-sm focus:outline-none glass-card placeholder-dim";
  const btn = "w-full px-4 py-3 btn-glass rounded-2xl text-sm disabled:opacity-50";

  return (
    <div className="h-full flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8 flex flex-col items-center">
          {branding?.logo_url ? (
            <img src={branding.logo_url} alt={branding.app_name || branding.business_name || 'Logo'} className="h-16 object-contain" />
          ) : branding !== null ? (
            <>
              <LogoMark size={56}/>
              <div className="mt-4"><Wordmark className="!text-4xl"/></div>
            </>
          ) : <div className="h-16" />}
          <div className="text-sm mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">CRM</div>
        </div>

        {mode === 'code' ? (
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
            <button type="submit" disabled={busy || code.length < 6} className={btn}>
              {busy ? 'Verifying...' : 'Verify & sign in'}
            </button>
            {error && <div className="text-xs text-red-500 text-center">{error}</div>}
            <div className="flex items-center justify-between text-xs text-muted pt-1">
              <button type="button" onClick={() => { setMode('password'); setCode(''); setError(''); }} className="hover:text-ink">&larr; Back</button>
              <button type="button" onClick={sendLink} disabled={busy} className="hover:text-ink">{busy ? 'Sending...' : 'Resend code'}</button>
            </div>
          </form>
        ) : mode === 'link' ? (
          <form onSubmit={sendLink} className="glass-raised glass-shimmer rounded-3xl p-8 space-y-4">
            <input type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" className={field} />
            <button type="submit" disabled={busy || !email} className={btn}>
              {busy ? 'Sending...' : 'Email me a sign-in link'}
            </button>
            {error && <div className="text-xs text-red-500 text-center">{error}</div>}
            <div className="text-xs text-muted text-center pt-1">
              <button type="button" onClick={() => { setMode('password'); setError(''); }} className="hover:text-ink">&larr; Use password instead</button>
            </div>
          </form>
        ) : (
          <form onSubmit={signInPassword} className="glass-raised glass-shimmer rounded-3xl p-8 space-y-4">
            <input type="email" required autoFocus autoComplete="username"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" className={field} />
            <input type="password" required autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password" className={field} />
            <button type="submit" disabled={busy || !email || !password} className={btn}>
              {busy ? 'Signing in...' : 'Sign in'}
            </button>
            {error && <div className="text-xs text-red-500 text-center">{error}</div>}
            <div className="text-xs text-muted text-center pt-1">
              <button type="button" onClick={() => { setMode('link'); setError(''); }} className="hover:text-ink">Email me a sign-in link instead</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
