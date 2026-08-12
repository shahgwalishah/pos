import { useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, User } from 'lucide-react';
import { supabase } from './lib/supabase';

export default function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const oauthError = params.get('error_description');
    if (oauthError) setError(oauthError);
  }, []);

  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const submit = async (event) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const result = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
        : await supabase.auth.signUp({ email: form.email, password: form.password, options: { data: { full_name: form.name } } });
      if (result.error) throw result.error;
      if (!result.data.session) {
        setError('Account created. Please check your email to confirm it, then sign in.');
        setMode('login');
        return;
      }
      onAuthenticated(result.data.user);
    } catch (err) { setError(err.message || 'Something went wrong.'); }
    finally { setLoading(false); }
  };

  const signInWithGoogle = async () => {
    setError(''); setOauthLoading(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/` } });
    if (oauthError) { setError(oauthError.message); setOauthLoading(false); }
  };

  const switchMode = (nextMode) => { setMode(nextMode); setError(''); };
  return <div className="auth-page">
    <section className="auth-showcase">
      <div className="auth-brand"><span>C</span><div><b>Counterly</b><small>Point of Sale</small></div></div>
      <div className="showcase-copy"><span className="auth-kicker">Simple. Fast. Reliable.</span><h1>Run your counter<br/>with confidence.</h1><p>Everything you need to take orders, manage stock and keep your business moving.</p><div className="mini-stats"><div><b>10×</b><span>Faster checkout</span></div><div><b>100%</b><span>Stock visibility</span></div></div></div>
      <div className="showcase-orb orb-one"/><div className="showcase-orb orb-two"/>
      <small className="copyright">© 2026 Counterly POS</small>
    </section>
    <section className="auth-form-side"><div className="auth-box">
      <span className="auth-kicker">{mode === 'login' ? 'Welcome back' : 'Get started'}</span>
      <h2>{mode === 'login' ? 'Sign in to Counterly' : 'Create your account'}</h2>
      <p>{mode === 'login' ? 'Enter your details to access your register.' : 'Set up your account in less than a minute.'}</p>
      <button className="google-auth" onClick={signInWithGoogle} disabled={oauthLoading}><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.09-1.92 3.27-4.75 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.29-2.65l-3.57-2.77c-.98.66-2.24 1.06-3.72 1.06-2.87 0-5.3-1.94-6.17-4.54H2.14v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.83 14.1A6.6 6.6 0 0 1 5.48 12c0-.73.13-1.43.35-2.1V7.06H2.14A11 11 0 0 0 1 12c0 1.77.42 3.44 1.14 4.94l3.69-2.84Z"/><path fill="#EA4335" d="M12 5.36c1.62 0 3.06.56 4.2 1.64l3.17-3.17A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.14 7.06L5.83 9.9C6.7 7.3 9.13 5.36 12 5.36Z"/></svg>{oauthLoading ? 'Opening Google…' : 'Continue with Google'}</button>
      <div className="auth-divider"><span>or continue with email</span></div>
      <div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Sign in</button><button className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')}>Sign up</button></div>
      <form onSubmit={submit}>
        {mode === 'signup' && <label>Full name<div className="auth-input"><User size={18}/><input required minLength="2" name="name" value={form.name} onChange={update} placeholder="Your full name" /></div></label>}
        <label>Email address<div className="auth-input"><Mail size={18}/><input required type="email" name="email" value={form.email} onChange={update} placeholder="you@example.com" /></div></label>
        <label>Password<div className="auth-input"><LockKeyhole size={18}/><input required minLength="6" type={showPassword ? 'text' : 'password'} name="password" value={form.password} onChange={update} placeholder="Minimum 6 characters" /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
        {error && <div className="auth-error">{error}</div>}
        <button className="auth-submit" disabled={loading}>{loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={18}/></button>
      </form>
      <p className="auth-switch">{mode === 'login' ? "Don't have an account?" : 'Already have an account?'} <button onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'Create one' : 'Sign in'}</button></p>
    </div></section>
  </div>;
}
