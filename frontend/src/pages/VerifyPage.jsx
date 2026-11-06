import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { api } from '../api.js';
import { ErrorText, Pill, Spinner, fmtDate, ratingTone } from '../components/ui.jsx';

export default function VerifyPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api.verify(id).then(setData).catch((e) => setError(e.message)); }, [id]);

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">Credential verification</h1>
      <p className="text-xs text-slate-400 mb-6">Anyone can confirm that a VerificLink badge is genuine and unaltered.</p>
      {!data && !error && <Spinner label="Checking signature…" />}
      {error && <ErrorText>{error}</ErrorText>}
      {data && (
        <div className={`card ${data.valid ? 'border-emerald-800' : 'border-red-800'}`}>
          <div className="flex items-center gap-3 mb-4">
            {data.valid ? <CheckCircle2 className="w-10 h-10 text-emerald-400" /> : <ShieldAlert className="w-10 h-10 text-red-400" />}
            <div>
              <div className={`text-lg font-bold ${data.valid ? 'text-emerald-400' : 'text-red-400'}`}>{data.valid ? 'Valid credential' : 'Signature mismatch — do not trust'}</div>
              <div className="text-xs text-slate-400">Issued by VerificLink</div>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-y-3 text-sm">
            <dt className="text-slate-400 text-xs">Holder</dt><dd className="col-span-2 text-white font-semibold">{data.holder}</dd>
            <dt className="text-slate-400 text-xs">Type</dt><dd className="col-span-2 capitalize text-white">{data.kind === 'paper' ? 'Research defense' : data.kind === 'project' ? 'Code defense' : 'Skill audit'}</dd>
            <dt className="text-slate-400 text-xs">Subject</dt><dd className="col-span-2 text-white">{data.title}</dd>
            <dt className="text-slate-400 text-xs">Result</dt><dd className="col-span-2"><Pill tone={ratingTone(data.rating)}>{data.rating}</Pill> <span className="text-white ml-1">{data.score}%</span></dd>
            <dt className="text-slate-400 text-xs">Verified</dt><dd className="col-span-2 text-white">{fmtDate(data.verified_at)}</dd>
            <dt className="text-slate-400 text-xs">Graded by</dt><dd className="col-span-2 text-white">{{ ai: 'AI evaluator', bank: 'Question bank', heuristic: 'Heuristic checker', demo: 'Demo data' }[data.grading_mode] || '—'}</dd>
          </dl>
          {data.demo_seed && <div className="mt-4"><Pill tone="amber">Demo seed data — not a real assessment</Pill></div>}
          <p className="text-[10px] text-slate-600 mt-4 font-mono break-all">ID {data.credential_id}</p>
        </div>
      )}
      <p className="text-center mt-6"><Link to="/" className="text-xs text-cyan-400 hover:underline">← Back to VerificLink</Link></p>
    </div>
  );
}
