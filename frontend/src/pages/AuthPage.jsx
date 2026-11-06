import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Building2, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { ErrorText } from '../components/ui.jsx';

export default function AuthPage({ register = false }) {
  const { user, login, register: signUp } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'candidate', company_name: '', github_username: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (register) {
        await signUp({
          email: form.email, password: form.password, name: form.name, role: form.role,
          company_name: form.role === 'recruiter' ? form.company_name : null,
          github_username: form.role === 'candidate' ? form.github_username || null : null,
        });
      } else {
        await login(form.email, form.password);
      }
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const fill = (email) => setForm((f) => ({ ...f, email, password: 'demo1234' }));

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_rgba(6,182,212,0.12),_transparent_60%)]">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <ShieldCheck className="w-7 h-7 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Verific<span className="text-cyan-400">Link</span></h1>
            <p className="text-xs text-slate-400">No proof, no profile.</p>
          </div>
        </div>

        <form onSubmit={submit} className="card space-y-4">
          <h2 className="text-lg font-bold text-white">{register ? 'Create your account' : 'Sign in'}</h2>

          {register && (
            <div className="grid grid-cols-2 gap-2">
              {[['candidate', 'Candidate', UserCheck], ['recruiter', 'Recruiter', Building2]].map(([role, label, Icon]) => (
                <button type="button" key={role} onClick={() => setForm((f) => ({ ...f, role }))}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition ${
                    form.role === role ? 'bg-cyan-950/60 border-cyan-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'}`}>
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>
          )}

          {register && (
            <div><label className="label">Full name</label><input className="input" required value={form.name} onChange={set('name')} /></div>
          )}
          {register && form.role === 'recruiter' && (
            <div><label className="label">Company</label><input className="input" required value={form.company_name} onChange={set('company_name')} /></div>
          )}
          <div><label className="label">Email</label><input className="input" type="email" required autoComplete="email" value={form.email} onChange={set('email')} /></div>
          <div><label className="label">Password</label><input className="input" type="password" required minLength={register ? 8 : 1} autoComplete={register ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} />
            {register && <p className="text-[10px] text-slate-500 mt-1">At least 8 characters.</p>}</div>
          {register && form.role === 'candidate' && (
            <div><label className="label">GitHub username <span className="text-slate-500 font-normal">(needed to defend repositories)</span></label>
              <input className="input" placeholder="octocat" value={form.github_username} onChange={set('github_username')} /></div>
          )}

          <ErrorText>{error}</ErrorText>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>

          <p className="text-xs text-slate-400 text-center">
            {register ? <>Already verified? <Link className="text-cyan-400 hover:underline" to="/login">Sign in</Link></>
              : <>New here? <Link className="text-cyan-400 hover:underline" to="/register">Create an account</Link></>}
          </p>
        </form>

        {!register && (
          <div className="mt-4 text-center text-[11px] text-slate-500 space-x-3">
            <span>Demo (password demo1234):</span>
            <button className="text-cyan-400 hover:underline" onClick={() => fill('alex@demo.dev')}>candidate</button>
            <button className="text-cyan-400 hover:underline" onClick={() => fill('recruiter@neuralscale.dev')}>recruiter</button>
          </div>
        )}
      </div>
    </div>
  );
}
