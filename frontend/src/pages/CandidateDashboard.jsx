import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Award, BookOpen, CheckCircle2, Clock, Code, Copy, ExternalLink, FileText, Github, History, Pencil, Play, Plus, ShieldCheck } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import DefenseModal from '../components/DefenseModal.jsx';
import { Avatar, ErrorText, Modal, Pill, Spinner, fmtDate, fmtDuration, ratingTone, useCopy, verifyUrl } from '../components/ui.jsx';

function CredentialTags({ c }) {
  const mode = c.data?.grading_mode;
  return (
    <>
      {c.data?.demo_seed && <Pill tone="amber" title="Seeded demo data, not a real assessment">demo data</Pill>}
      {mode === 'heuristic' && <Pill tone="amber" title="Graded by the keyword/length heuristic because no AI key is configured">heuristic-graded</Pill>}
      {mode === 'ai' && <Pill tone="indigo">AI-graded</Pill>}
      {c.data?.repo?.status === 'unavailable' && <Pill tone="amber" title="GitHub could not be reached; ownership was not machine-checked">ownership unchecked</Pill>}
      {c.data?.doi_status === 'unavailable' && <Pill tone="amber" title="Crossref could not be reached; authorship was not machine-checked">authorship unchecked</Pill>}
    </>
  );
}

export default function CandidateDashboard() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [config, setConfig] = useState(null);
  const [history, setHistory] = useState([]);
  const [skill, setSkill] = useState('');
  const [skillError, setSkillError] = useState('');
  const [starting, setStarting] = useState(false);
  const [defenseType, setDefenseType] = useState(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [copied, copy] = useCopy();

  const load = useCallback(() => {
    Promise.all([api.profile(), api.config(), api.history()])
      .then(([p, c, h]) => { setProfile(p); setConfig(c); setHistory(h); })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const startSkill = async (name) => {
    if (!name.trim()) return;
    setStarting(true);
    setSkillError('');
    try {
      const a = await api.startSkill(name.trim());
      navigate(`/assessment/${a.id}`);
    } catch (e) {
      setSkillError(e.status === 429 ? `Cool-down active — try again in ${fmtDuration(e.detail.retry_after_seconds)}.` : e.message);
    } finally {
      setStarting(false);
    }
  };

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!profile) return <Spinner label="Loading your proof profile…" />;

  const active = history.find((h) => h.status === 'active');

  return (
    <div className="space-y-8">
      {/* Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 p-6 md:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-5">
            <div className="relative">
              <Avatar name={profile.name} size="w-20 h-20" text="text-2xl" />
              <div className="absolute -bottom-1 -right-1 bg-cyan-500 text-slate-950 p-1 rounded-lg shadow"><ShieldCheck className="w-4 h-4 stroke-[3]" /></div>
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-white tracking-tight">{profile.name}</h1>
                <Pill tone="cyan">{profile.skills.length + profile.projects.length + profile.papers.length > 0 ? 'Verified Candidate' : 'Unverified — earn your first badge'}</Pill>
                <button onClick={() => setEditing(true)} className="text-slate-500 hover:text-cyan-400" title="Edit profile"><Pencil className="w-4 h-4" /></button>
              </div>
              <p className="text-slate-400 font-medium text-sm mt-0.5">{profile.title || 'Add a headline'}</p>
              <p className="text-slate-500 text-xs mt-2 max-w-xl">{profile.bio || 'Add a short bio so recruiters know what you do.'}</p>
              <p className="text-slate-500 text-xs mt-2 flex items-center gap-1.5"><Github className="w-3.5 h-3.5" />{profile.github_username ? `@${profile.github_username}` : <span className="text-amber-400">Set your GitHub username to defend repositories</span>}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            {[['Verified Skills', profile.skills.length, 'text-cyan-400'], ['Code Defenses', profile.projects.length, 'text-blue-400'], ['Papers', profile.papers.length, 'text-indigo-400']].map(([l, n, c]) => (
              <div key={l} className="bg-slate-950/60 border border-slate-800 px-4 py-3 rounded-xl flex-1 md:flex-none text-center">
                <span className="text-xs text-slate-400 block font-medium">{l}</span><span className={`text-xl font-extrabold ${c}`}>{n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {active && (
        <div className="flex items-center justify-between bg-amber-950/40 border border-amber-800 rounded-xl px-4 py-3 text-sm text-amber-200">
          <span>You have a test in progress: <b>{active.title}</b></span>
          <Link to={`/assessment/${active.id}`} className="btn-primary !py-1.5 !text-xs">Resume</Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2"><Award className="w-5 h-5 text-cyan-400" /><h2 className="text-lg font-bold text-white">Verified Skill Audits</h2></div>
              <span className="text-xs text-slate-400 font-mono">{config.skill_minutes}-min proctored</span>
            </div>
            <p className="text-xs text-slate-400 mb-4">Pass a timed, proctored assessment to earn a signed Intermediate or Expert badge (pass mark {config.pass_score}%).</p>

            <form className="bg-slate-950 border border-slate-800 rounded-xl p-2 mb-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); startSkill(skill); }}>
              <input value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="e.g. Python, SQL, React" className="bg-transparent text-xs text-white placeholder-slate-500 flex-1 outline-none px-2" />
              <button disabled={starting || !skill.trim()} className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1"><Play className="w-3.5 h-3.5 fill-current" /> Audit</button>
            </form>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {config.skill_topics.map((t) => (
                <button key={t} onClick={() => startSkill(t)} disabled={starting} className="text-[10px] bg-slate-950 border border-slate-800 hover:border-cyan-700 text-slate-400 hover:text-cyan-300 px-2 py-0.5 rounded-full transition">{t}</button>
              ))}
            </div>
            {!config.llm_enabled && <p className="text-[10px] text-slate-500 mb-3">Only the skills above have built-in banks. Set <code>ANTHROPIC_API_KEY</code> on the server to audit any skill.</p>}
            <ErrorText>{skillError}</ErrorText>

            <div className="space-y-3 mt-3">
              {profile.skills.length === 0 && <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">No verified skills yet.</div>}
              {profile.skills.map((s) => (
                <div key={s.id} className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-800 flex items-center justify-center text-cyan-400 shrink-0"><ShieldCheck className="w-4 h-4" /></div>
                      <div className="min-w-0"><h4 className="text-sm font-semibold text-white truncate">{s.title}</h4><p className="text-[10px] text-slate-500">Verified {fmtDate(s.verified_at)}</p></div>
                    </div>
                    <Pill tone={ratingTone(s.rating)}>{s.rating} · {s.score}%</Pill>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <CredentialTags c={s} />
                    <button onClick={() => copy(verifyUrl(s.id), s.id)} className="ml-auto text-[10px] text-slate-500 hover:text-cyan-400 flex items-center gap-1"><Copy className="w-3 h-3" />{copied === s.id ? 'copied' : 'verify link'}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-4"><History className="w-5 h-5 text-slate-400" /><h2 className="text-lg font-bold text-white">Recent attempts</h2></div>
            {history.length === 0 ? <p className="text-xs text-slate-500">Nothing yet.</p> : (
              <ul className="space-y-2">
                {history.slice(0, 8).map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2 text-xs bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2">
                    <span className="truncate text-slate-300">{h.title}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      {h.retry_after_seconds > 0 && <span className="text-amber-400 flex items-center gap-1" title="Cool-down"><Clock className="w-3 h-3" />{fmtDuration(h.retry_after_seconds)}</span>}
                      <Pill tone={h.status === 'passed' ? 'emerald' : h.status === 'active' ? 'amber' : 'red'}>{h.status}{h.score != null && h.status !== 'active' ? ` ${h.score}%` : ''}</Pill>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right columns */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2"><Code className="w-5 h-5 text-blue-400" /><h2 className="text-lg font-bold text-white">Verified GitHub & Code Defenses</h2></div>
                <p className="text-xs text-slate-400 mt-1">Forks are rejected and ownership is checked against your GitHub username. Questions are generated from your repository.</p>
              </div>
              <button onClick={() => setDefenseType('project')} className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-blue-600/20 shrink-0"><Plus className="w-4 h-4" /> Defend Codebase</button>
            </div>
            <div className="space-y-4">
              {profile.projects.length === 0 && <div className="text-center py-8 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">No defended repositories yet.</div>}
              {profile.projects.map((p) => (
                <div key={p.id} className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 hover:border-slate-700 transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Github className="w-4 h-4 text-slate-400" /><h3 className="text-sm font-bold text-white">{p.title}</h3>
                        <Pill tone="emerald"><CheckCircle2 className="w-3 h-3" /> Defended ({p.score}%)</Pill>
                        <CredentialTags c={p} />
                      </div>
                      <p className="text-xs text-slate-400 mt-2">{p.data?.summary}</p>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {(p.data?.tech || []).map((t) => <span key={t} className="text-[10px] bg-slate-900 border border-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">{t}</span>)}
                        <button onClick={() => copy(verifyUrl(p.id), p.id)} className="ml-auto text-[10px] text-slate-500 hover:text-cyan-400 flex items-center gap-1"><Copy className="w-3 h-3" />{copied === p.id ? 'copied' : 'verify link'}</button>
                      </div>
                    </div>
                    {p.url && <a href={`https://${p.url}`} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-cyan-400 p-2 rounded-lg bg-slate-900 border border-slate-800"><ExternalLink className="w-4 h-4" /></a>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2"><BookOpen className="w-5 h-5 text-indigo-400" /><h2 className="text-lg font-bold text-white">Academic & Research Defenses</h2></div>
                <p className="text-xs text-slate-400 mt-1">Your name must appear among the DOI's authors (checked via Crossref). Questions come from the methodology.</p>
              </div>
              <button onClick={() => setDefenseType('paper')} className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-600/20 shrink-0"><Plus className="w-4 h-4" /> Defend Paper</button>
            </div>
            <div className="space-y-4">
              {profile.papers.length === 0 && <div className="text-center py-8 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">No defended papers yet.</div>}
              {profile.papers.map((p) => (
                <div key={p.id} className="bg-slate-950 border border-slate-800/80 rounded-xl p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileText className="w-4 h-4 text-indigo-400" /><h3 className="text-sm font-bold text-white">{p.title}</h3>
                    <Pill tone="emerald"><CheckCircle2 className="w-3 h-3" /> Defended ({p.score}%)</Pill>
                    <CredentialTags c={p} />
                  </div>
                  <p className="text-xs text-indigo-300 font-mono mt-1">{p.data?.doi ? `DOI: ${p.data.doi}` : 'No DOI'}{p.data?.journal ? ` • ${p.data.journal}` : ''}</p>
                  <p className="text-xs text-slate-400 mt-2">{p.data?.summary}</p>
                  <button onClick={() => copy(verifyUrl(p.id), p.id)} className="mt-2 text-[10px] text-slate-500 hover:text-cyan-400 flex items-center gap-1"><Copy className="w-3 h-3" />{copied === p.id ? 'copied' : 'verify link'}</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {defenseType && (
        <DefenseModal type={defenseType} githubUsername={profile.github_username} onClose={() => setDefenseType(null)}
          onStarted={(a) => navigate(`/assessment/${a.id}`)} />
      )}
      {editing && <EditProfileModal profile={profile} onClose={() => setEditing(false)} onSaved={(p) => { setProfile(p); setUser({ ...user, ...p }); setEditing(false); }} />}
    </div>
  );
}

function EditProfileModal({ profile, onClose, onSaved }) {
  const [f, setF] = useState({ title: profile.title || '', bio: profile.bio || '', github_username: profile.github_username || '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { onSaved(await api.updateProfile(f)); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal title="Edit profile" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 mt-4">
        <div><label className="label">Headline</label><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label className="label">Bio</label><textarea rows={3} className="input" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></div>
        <div><label className="label">GitHub username</label><input className="input" value={f.github_username} onChange={(e) => setF({ ...f, github_username: e.target.value })} /></div>
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy}>Save</button>
      </form>
    </Modal>
  );
}
