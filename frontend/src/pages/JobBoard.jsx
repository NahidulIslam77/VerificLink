import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, Check, MapPin, Sparkles } from 'lucide-react';
import { api } from '../api.js';
import { Bar, ErrorText, Pill, Spinner, matchTone } from '../components/ui.jsx';

export default function JobBoard() {
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState({});

  const load = () => api.jobs().then((j) => setJobs([...j].sort((a, b) => b.match.score - a.match.score))).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const apply = async (id) => {
    setBusy(id);
    setNotice((n) => ({ ...n, [id]: '' }));
    try { await api.apply(id); await load(); } catch (e) { setNotice((n) => ({ ...n, [id]: e.message })); } finally { setBusy(null); }
  };

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!jobs) return <Spinner label="Matching you against open roles…" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Briefcase className="w-6 h-6 text-cyan-400" /> Open roles</h1>
        <p className="text-xs text-slate-400 mt-1">Match scores use only your verified credentials. Verify the missing skills to climb the ranking.</p>
      </div>
      {jobs.length === 0 && <div className="card text-sm text-slate-400">No jobs posted yet.</div>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {jobs.map((j) => (
          <div key={j.id} className="card space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-[10px] text-cyan-400 font-mono">{j.company}</span>
                <h2 className="text-base font-bold text-white">{j.title}</h2>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap"><MapPin className="w-3 h-3" />{j.location} · {j.type}{j.salary && ` · ${j.salary}`}</p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] text-slate-400 block font-mono">YOUR MATCH</span>
                <span className={`text-3xl font-black ${matchTone(j.match.score)}`}>{j.match.score}%</span>
              </div>
            </div>
            {j.description && <p className="text-xs text-slate-400">{j.description}</p>}

            <div className="flex flex-wrap gap-1.5">
              {j.required_skills.map((s) => (
                <Pill key={s} tone={j.match.matched_skills.includes(s) ? 'emerald' : 'slate'}>{j.match.matched_skills.includes(s) && <Check className="w-3 h-3" />}{s}</Pill>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-800/60">
              <Bar label={`Skills (${j.skill_weight}%)`} value={j.match.breakdown.skills} />
              <Bar label={`Code (${j.code_weight}%)`} value={j.match.breakdown.code} tone="bg-blue-500" />
              <Bar label={`Research (${j.paper_weight}%)`} value={j.match.breakdown.research} tone="bg-indigo-500" />
            </div>

            {j.match.missing_skills.length > 0 && (
              <p className="text-[11px] text-amber-300/90 flex items-start gap-1.5"><Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Not yet verified: {j.match.missing_skills.join(', ')}. <Link to="/" className="underline hover:text-amber-200">Take the audits</Link></p>
            )}
            <ErrorText>{notice[j.id]}</ErrorText>
            <button className={j.applied ? 'btn-ghost w-full' : 'btn-primary w-full'} disabled={j.applied || busy === j.id} onClick={() => apply(j.id)}>
              {j.applied ? <><Check className="w-4 h-4" /> Applied</> : busy === j.id ? 'Applying…' : 'Apply with verified proof'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
