import React, { useCallback, useEffect, useState } from 'react';
import { Building2, CheckCircle2, ExternalLink, Eye, Filter, Plus, ShieldAlert, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Avatar, Bar, ErrorText, Modal, Pill, Spinner, fmtDate, matchTone, ratingTone } from '../components/ui.jsx';

export default function RecruiterDashboard() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [data, setData] = useState(null);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [inspect, setInspect] = useState(null);

  const loadJobs = useCallback(async (selectId) => {
    try {
      const j = await api.jobs(true);
      setJobs(j);
      setSelectedId((cur) => selectId ?? (j.some((x) => x.id === cur) ? cur : j[0]?.id ?? null));
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { loadJobs(); }, [loadJobs]);

  useEffect(() => {
    if (!selectedId) { setData(null); return; }
    setLoadingMatches(true);
    api.matches(selectedId).then(setData).catch((e) => setError(e.message)).finally(() => setLoadingMatches(false));
  }, [selectedId]);

  const remove = async (job) => {
    if (!window.confirm(`Delete "${job.title}" and its applications?`)) return;
    try { await api.deleteJob(job.id); await loadJobs(); } catch (e) { setError(e.message); }
  };

  if (!jobs) return error ? <ErrorText>{error}</ErrorText> : <Spinner label="Loading hub…" />;
  const selected = jobs.find((j) => j.id === selectedId);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 card">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Building2 className="w-6 h-6 text-cyan-400" /> {user.company_name} · Matching Hub</h1>
          <p className="text-xs text-slate-400 mt-1">Zero resume fraud. Candidates are ranked strictly by verified proof-of-work.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary"><Plus className="w-4 h-4" /> Post job spec</button>
      </div>
      <ErrorText>{error}</ErrorText>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><Filter className="w-4 h-4" /> Your job requirements</h2>
          {jobs.length === 0 && <div className="card text-xs text-slate-400">No jobs yet — post one to see ranked candidates.</div>}
          {jobs.map((job) => (
            <div key={job.id} onClick={() => setSelectedId(job.id)}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedId === job.id ? 'bg-slate-900 border-cyan-500/60 shadow-lg shadow-cyan-500/5' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}>
              <div className="flex items-start justify-between gap-2">
                <div><span className="text-[10px] text-cyan-400 font-mono">{job.company}</span><h3 className="text-sm font-bold text-white mt-0.5">{job.title}</h3></div>
                <button onClick={(e) => { e.stopPropagation(); remove(job); }} className="text-slate-600 hover:text-red-400" title="Delete job"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">{job.required_skills.map((s) => <span key={s} className="text-[10px] bg-slate-950 text-slate-400 border border-slate-800 px-2 py-0.5 rounded">{s}</span>)}</div>
              <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>Skills {job.skill_weight}%</span><span>Code {job.code_weight}%</span><span>Research {job.paper_weight}%</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-2">{job.applicant_count} applicant{job.applicant_count === 1 ? '' : 's'}</div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><Sparkles className="w-4 h-4 text-cyan-400" /> Match rankings</h2>
              {selected && <p className="text-xs text-slate-500">Matching against: <span className="text-slate-300 font-semibold">{selected.title}</span></p>}
            </div>
            {data && <Pill tone="cyan">{data.matches.length} verified candidates</Pill>}
          </div>

          {loadingMatches && <Spinner label="Ranking candidates…" />}
          {!loadingMatches && data?.matches.length === 0 && <div className="card text-xs text-slate-400">No verified candidates yet.</div>}
          {!loadingMatches && data?.matches.map((m, i) => (
            <div key={m.candidate.id} className="card !p-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Avatar name={m.candidate.name} />
                    <div className="absolute -top-2 -left-2 bg-slate-950 text-slate-300 border border-slate-800 text-[10px] font-bold w-6 h-6 rounded-full flex items-center justify-center">#{i + 1}</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-white">{m.candidate.name}</h3><ShieldCheck className="w-4 h-4 text-cyan-400" />
                      {m.applied && <Pill tone="emerald">Applied</Pill>}
                    </div>
                    <p className="text-xs text-slate-400">{m.candidate.title}</p>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400"><span>{m.counts.skill} skill audits</span>•<span>{m.counts.project} defended repos</span>•<span>{m.counts.paper} papers</span></div>
                  </div>
                </div>
                <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                  <div className="text-right"><span className="text-[10px] text-slate-400 block font-mono">MATCH SCORE</span><span className={`text-2xl font-black ${matchTone(m.match.score)}`}>{m.match.score}%</span></div>
                  <button onClick={() => setInspect(m.candidate.id)} className="btn-ghost !text-xs"><Eye className="w-4 h-4" /> Audit proof</button>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-800/60 grid grid-cols-3 gap-3">
                <Bar label="Verified skills" value={m.match.breakdown.skills} />
                <Bar label="Code alignment" value={m.match.breakdown.code} tone="bg-blue-500" />
                <Bar label="Research relevance" value={m.match.breakdown.research} tone="bg-indigo-500" />
              </div>
              {m.match.missing_skills.length > 0 && <p className="text-[10px] text-slate-500 mt-3">Missing verified skills: {m.match.missing_skills.join(', ')}</p>}
            </div>
          ))}
        </div>
      </div>

      {showNew && <CreateJobModal company={user.company_name} onClose={() => setShowNew(false)} onCreated={async (j) => { setShowNew(false); await loadJobs(j.id); }} />}
      {inspect && <CandidateModal id={inspect} onClose={() => setInspect(null)} />}
    </div>
  );
}

function CreateJobModal({ company, onClose, onCreated }) {
  const [f, setF] = useState({ title: '', location: 'Remote', salary: '', description: '', skills: '', skill_weight: 40, code_weight: 40, paper_weight: 20 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const total = Number(f.skill_weight) + Number(f.code_weight) + Number(f.paper_weight);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const job = await api.createJob({
        title: f.title, company, location: f.location, salary: f.salary, description: f.description,
        required_skills: f.skills.split(',').map((s) => s.trim()).filter(Boolean),
        skill_weight: Number(f.skill_weight), code_weight: Number(f.code_weight), paper_weight: Number(f.paper_weight),
      });
      onCreated(job);
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Modal title="Post job requirements" subtitle="Weights are normalised, so they don't need to sum to 100." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div><label className="label">Role title</label><input className="input" required value={f.title} onChange={set('title')} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Location</label><input className="input" value={f.location} onChange={set('location')} /></div>
          <div><label className="label">Salary range</label><input className="input" placeholder="$150k – $190k" value={f.salary} onChange={set('salary')} /></div>
        </div>
        <div><label className="label">Description</label><textarea rows={3} className="input" value={f.description} onChange={set('description')} placeholder="Domain, stack and research focus — used for semantic matching against defended projects and papers." /></div>
        <div><label className="label">Required verified skills (comma-separated)</label><input className="input" placeholder="Python, SQL, Docker" value={f.skills} onChange={set('skills')} /></div>
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <h4 className="text-xs font-mono text-cyan-400 uppercase font-semibold">Score weights (%)</h4>
          <div className="grid grid-cols-3 gap-3">
            {[['skill_weight', 'Skills'], ['code_weight', 'Code'], ['paper_weight', 'Papers']].map(([k, l]) => (
              <div key={k}><label className="text-[10px] text-slate-400 block mb-1">{l}</label><input type="number" min="0" max="100" className="input !py-1 font-mono" value={f[k]} onChange={set(k)} /></div>
            ))}
          </div>
          <p className="text-[10px] text-slate-500">Total {total}{total !== 100 && total > 0 ? ' — will be normalised' : ''}</p>
        </div>
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy || total <= 0}>{busy ? 'Saving…' : 'Save job & rank candidates'}</button>
      </form>
    </Modal>
  );
}

function CandidateModal({ id, onClose }) {
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.candidate(id).then(setC).catch((e) => setError(e.message)); }, [id]);

  const Row = ({ item, tone }) => (
    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-white">{item.title}</span>
        <div className="flex items-center gap-1.5">
          <Pill tone={tone}>{item.rating} · {item.score}%</Pill>
          {item.signature_valid ? <span title="Signature valid"><CheckCircle2 className="w-4 h-4 text-emerald-400" /></span> : <span title="Signature INVALID"><ShieldAlert className="w-4 h-4 text-red-400" /></span>}
        </div>
      </div>
      {item.data?.summary && <p className="text-[11px] text-slate-400 mt-1">{item.data.summary}</p>}
      <div className="flex items-center gap-2 flex-wrap mt-2 text-[10px] text-slate-500">
        <span>Verified {fmtDate(item.verified_at)}</span>
        {item.data?.grading_mode && <Pill tone={item.data.grading_mode === 'ai' ? 'indigo' : 'slate'}>{item.data.grading_mode}</Pill>}
        {item.data?.demo_seed && <Pill tone="amber">demo data</Pill>}
        {item.data?.repo?.ownership && <Pill tone={item.data.repo.status === 'verified' ? 'emerald' : 'amber'}>repo {item.data.repo.ownership}</Pill>}
        {item.data?.doi_status && <Pill tone={item.data.doi_status === 'verified' ? 'emerald' : 'amber'}>authorship {item.data.doi_status}</Pill>}
        <a href={`/verify/${item.id}`} target="_blank" rel="noreferrer" className="ml-auto text-cyan-400 hover:underline flex items-center gap-1">verify <ExternalLink className="w-3 h-3" /></a>
      </div>
    </div>
  );

  return (
    <Modal wide onClose={onClose}>
      {!c && !error && <Spinner label="Loading proof…" />}
      <ErrorText>{error}</ErrorText>
      {c && (
        <>
          <div className="flex items-center gap-4 mb-6">
            <Avatar name={c.name} size="w-16 h-16" />
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">{c.name} <ShieldCheck className="w-5 h-5 text-cyan-400" /></h2>
              <p className="text-xs text-slate-400">{c.title}</p>
              {c.github_username && <p className="text-[11px] text-slate-500">github.com/{c.github_username}</p>}
            </div>
          </div>
          <div className="space-y-6">
            {[['Proctored skill badges', c.skills, 'cyan'], ['Defended code repositories', c.projects, 'blue'], ['Defended research papers', c.papers, 'indigo']].map(([label, items, tone]) => (
              <div key={label}>
                <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-3">{label}</h3>
                {items.length === 0 ? <p className="text-xs text-slate-500 italic">None registered.</p> : <div className="space-y-2">{items.map((it) => <Row key={it.id} item={it} tone={tone === 'cyan' ? ratingTone(it.rating) : tone} />)}</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
