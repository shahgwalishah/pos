import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, Mail, User } from 'lucide-react';
import { supabase } from './lib/supabase';

export default function AuthPage({ onAuthenticated, recovery = false, onRecoveryComplete }) {
  const [mode, setMode] = useState(recovery ? 'recovery' : 'login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [confirmPassword, setConfirmPassword] = useState('');
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

  useEffect(() => { if (recovery) setMode('recovery'); }, [recovery]);

  const sendResetEmail = async (event) => {
    event.preventDefault(); setError(''); setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(form.email.trim(), { redirectTo: `${window.location.origin}/` });
    setLoading(false);
    if (resetError) return setError(resetError.message);
    setMode('reset-sent');
  };

  const updatePassword = async (event) => {
    event.preventDefault(); setError('');
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    if (form.password !== confirmPassword) return setError('Passwords do not match.');
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: form.password });
    if (updateError) { setLoading(false); return setError(updateError.message); }
    await supabase.auth.signOut(); setLoading(false); setMode('password-updated');
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
      <span className="auth-kicker">{mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Get started' : 'Account recovery'}</span>
      <h2>{mode === 'login' ? 'Sign in to Counterly' : mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Forgot your password?' : mode === 'recovery' ? 'Create a new password' : mode === 'reset-sent' ? 'Check your email' : 'Password updated'}</h2>
      <p>{mode === 'login' ? 'Enter your details to access your register.' : mode === 'signup' ? 'Set up your account in less than a minute.' : mode === 'forgot' ? 'Enter your account email and we will send a secure reset link.' : mode === 'recovery' ? 'Choose a strong password for your Counterly account.' : mode === 'reset-sent' ? `We sent password reset instructions to ${form.email}.` : 'Your password was changed successfully. You can now sign in.'}</p>
      {(mode === 'reset-sent' || mode === 'password-updated') && <div className="auth-status-icon"><CheckCircle2 size={30}/></div>}
      {mode === 'forgot' && <form onSubmit={sendResetEmail} className="recovery-form"><label>Email address<div className="auth-input"><Mail size={18}/><input autoFocus required type="email" name="email" value={form.email} onChange={update} placeholder="you@example.com" /></div></label>{error && <div className="auth-error">{error}</div>}<button className="auth-submit" disabled={loading}>{loading ? 'Sending…' : 'Send reset link'} <Mail size={18}/></button><button type="button" className="auth-back" onClick={() => { setMode('login'); setError(''); }}><ArrowLeft size={16}/> Back to sign in</button></form>}
      {mode === 'recovery' && <form onSubmit={updatePassword} className="recovery-form"><label>New password<div className="auth-input"><KeyRound size={18}/><input autoFocus required minLength="8" type={showPassword ? 'text' : 'password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Minimum 8 characters"/><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label><label>Confirm password<div className="auth-input"><LockKeyhole size={18}/><input required minLength="8" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter password again"/></div></label>{error && <div className="auth-error">{error}</div>}<button className="auth-submit" disabled={loading}>{loading ? 'Updating…' : 'Update password'} <ArrowRight size={18}/></button></form>}
      {(mode === 'reset-sent' || mode === 'password-updated') && <button className="auth-submit recovery-primary" onClick={() => { if (mode === 'password-updated') onRecoveryComplete?.(); setMode('login'); setError(''); }}>Return to sign in <ArrowRight size={18}/></button>}
      {(mode === 'login' || mode === 'signup') && <>
      <button className="google-auth" onClick={signInWithGoogle} disabled={oauthLoading}><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.09-1.92 3.27-4.75 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.29-2.65l-3.57-2.77c-.98.66-2.24 1.06-3.72 1.06-2.87 0-5.3-1.94-6.17-4.54H2.14v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.83 14.1A6.6 6.6 0 0 1 5.48 12c0-.73.13-1.43.35-2.1V7.06H2.14A11 11 0 0 0 1 12c0 1.77.42 3.44 1.14 4.94l3.69-2.84Z"/><path fill="#EA4335" d="M12 5.36c1.62 0 3.06.56 4.2 1.64l3.17-3.17A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.14 7.06L5.83 9.9C6.7 7.3 9.13 5.36 12 5.36Z"/></svg>{oauthLoading ? 'Opening Google…' : 'Continue with Google'}</button>
      <div className="auth-divider"><span>or continue with email</span></div>
      <div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Sign in</button><button className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')}>Sign up</button></div>
      <form onSubmit={submit}>
        {mode === 'signup' && <label>Full name<div className="auth-input"><User size={18}/><input required minLength="2" name="name" value={form.name} onChange={update} placeholder="Your full name" /></div></label>}
        <label>Email address<div className="auth-input"><Mail size={18}/><input required type="email" name="email" value={form.email} onChange={update} placeholder="you@example.com" /></div></label>
        <label>Password{mode === 'login' && <button type="button" className="forgot-link" onClick={() => { setMode('forgot'); setError(''); }}>Forgot password?</button>}<div className="auth-input"><LockKeyhole size={18}/><input required minLength="6" type={showPassword ? 'text' : 'password'} name="password" value={form.password} onChange={update} placeholder="Minimum 6 characters" /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
        {error && <div className="auth-error">{error}</div>}
        <button className="auth-submit" disabled={loading}>{loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={18}/></button>
      </form>
      <p className="auth-switch">{mode === 'login' ? "Don't have an account?" : 'Already have an account?'} <button onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'Create one' : 'Sign in'}</button></p>
      </>}
    </div></section>
  </div>;
}
