import React, { useState } from 'react';
import { RefreshCw, Sparkles, Upload } from 'lucide-react';
import { api } from '../api.js';
import { ErrorText, Modal, fmtDuration } from './ui.jsx';

export default function DefenseModal({ type, githubUsername, onClose, onStarted }) {
  const isProject = type === 'project';
  const [title, setTitle] = useState('');
  const [ref, setRef] = useState('');
  const [abstract, setAbstract] = useState('');
  const [pdf, setPdf] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let a;
      if (isProject) {
        a = await api.startProject({ title, url: ref, abstract });
      } else {
        const form = new FormData();
        form.append('title', title);
        form.append('doi', ref);
        form.append('abstract', abstract);
        if (pdf) form.append('pdf', pdf);
        a = await api.startPaper(form);
      }
      onStarted(a);
    } catch (err) {
      setError(err.status === 429 ? `Cool-down active — try again in ${fmtDuration(err.detail.retry_after_seconds)}.` : err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      title={<span className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-cyan-400" /> {isProject ? 'Defend a GitHub codebase' : 'Defend a research paper'}</span>}
      subtitle={isProject
        ? 'We check the repository is yours (not a fork), read its README and languages, then generate a 30-minute proctored defense.'
        : 'We check your authorship against the DOI in Crossref, read the abstract/PDF, then generate a 30-minute proctored defense.'}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">{isProject ? 'Project title' : 'Paper title'}</label>
          <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isProject ? 'Distributed Raft Engine' : 'Quantized Attention Vectors'} />
        </div>
        <div>
          <label className="label">{isProject ? 'GitHub repository URL' : 'DOI or publication URL'}</label>
          <input className="input" required={isProject} value={ref} onChange={(e) => setRef(e.target.value)} placeholder={isProject ? 'github.com/username/repo' : '10.1145/3318464.3389700'} />
          {isProject && !githubUsername && <p className="text-[11px] text-amber-400 mt-1">Set your GitHub username on your profile first — it's used to verify ownership.</p>}
        </div>
        <div>
          <label className="label">{isProject ? 'Architecture overview' : 'Methodology abstract'}</label>
          <textarea className="input" rows={4} required={isProject || !pdf} minLength={isProject || !pdf ? 20 : undefined} value={abstract} onChange={(e) => setAbstract(e.target.value)} placeholder="Describe the design / method in your own words (20+ characters)" />
        </div>
        {!isProject && (
          <div>
            <label className="label">Paper PDF <span className="text-slate-500 font-normal">(optional, 10 MB max)</span></label>
            <label className="flex items-center gap-2 input cursor-pointer text-slate-400"><Upload className="w-4 h-4" />{pdf ? pdf.name : 'Choose a text-based PDF…'}
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setPdf(e.target.files?.[0] || null)} /></label>
          </div>
        )}
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? <><RefreshCw className="w-4 h-4 animate-spin" /> Checking source & generating questions…</> : <><Sparkles className="w-4 h-4" /> Prepare proctored defense</>}
        </button>
      </form>
    </Modal>
  );
}
