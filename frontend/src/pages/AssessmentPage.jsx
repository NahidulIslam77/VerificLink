import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, Camera, CheckCircle2, Clock, Copy, Lock, Maximize, ShieldAlert, X, XCircle } from 'lucide-react';
import { api } from '../api.js';
import { useProctor } from '../components/proctor.js';
import { ErrorText, Pill, Spinner, fmtDuration, useCopy, verifyUrl } from '../components/ui.jsx';

const KIND_LABEL = { skill: 'Skill Audit', project: 'Code Defense', paper: 'Research Defense' };
const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const ansKey = (id) => `vl_answers_${id}`;

function loadAnswers(id) {
  try { return JSON.parse(sessionStorage.getItem(ansKey(id)) || '{}'); } catch { return {}; }
}

export default function AssessmentPage() {
  const { id } = useParams();
  const [phase, setPhase] = useState('loading'); // loading | gate | running | submitting | result | error
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  const [gateError, setGateError] = useState('');
  const [starting, setStarting] = useState(false);
  const [answers, setAnswers] = useState(() => loadAnswers(id));
  const [idx, setIdx] = useState(0);
  const [violations, setViolations] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [result, setResult] = useState(null);
  const [copied, copy] = useCopy();

  const endAt = useRef(0);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const submitted = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const finishRef = useRef(() => {});

  const stopMedia = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  const exitFs = () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };

  useEffect(() => {
    api.assessment(id).then((v) => {
      setA(v);
      setViolations(v.violation_count);
      if (v.status === 'pending' || v.status === 'active') setPhase('gate');
      else { setResult({ status: v.status, ...(v.result || {}) }); setPhase('result'); }
    }).catch((e) => { setError(e.message); setPhase('error'); });
    return () => { stopMedia(); exitFs(); };
  }, [id]);

  useEffect(() => {
    try { sessionStorage.setItem(ansKey(id), JSON.stringify(answers)); } catch { /* ignore */ }
  }, [answers, id]);

  const onServerState = useCallback((s) => {
    setViolations(s.violation_count);
    if (s.status !== 'active') finishRef.current();
  }, []);

  const proctor = useProctor({ active: phase === 'running', assessmentId: id, videoRef, onServerState });

  // attach camera stream once the <video> exists
  useEffect(() => {
    if (phase === 'running' && videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [phase]);

  const finish = async () => {
    if (submitted.current) return;
    submitted.current = true;
    setPhase('submitting');
    try {
      const res = await api.submit(id, answersRef.current);
      stopMedia(); exitFs();
      try { sessionStorage.removeItem(ansKey(id)); } catch { /* ignore */ }
      setResult(res);
      setPhase('result');
    } catch (e) {
      submitted.current = false;
      setError(e.message);
      setPhase('running');
    }
  };
  finishRef.current = finish;

  // countdown driven by the server-provided deadline
  useEffect(() => {
    if (phase !== 'running') return undefined;
    const tick = () => {
      const rem = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      setRemaining(rem);
      if (rem <= 0) finishRef.current();
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'running') return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [phase]);

  const start = async () => {
    setGateError('');
    setStarting(true);
    try {
      if (document.documentElement.requestFullscreen) { try { await document.documentElement.requestFullscreen(); } catch { /* not allowed here */ } }
      let camOk = false;
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        camOk = true;
      } catch { /* denied or no camera */ }
      if (a.require_camera && !camOk) {
        exitFs();
        setGateError('Camera access is required for this proctored test. Allow the camera in your browser and try again.');
        return;
      }
      const view = await api.begin(id, camOk);
      setA(view);
      setViolations(view.violation_count);
      endAt.current = Date.now() + view.remaining_seconds * 1000;
      setIdx(0);
      setPhase('running');
    } catch (e) {
      stopMedia(); exitFs();
      setGateError(e.message);
    } finally {
      setStarting(false);
    }
  };

  // ------------------------------------------------------------------ views
  if (phase === 'loading') return <Spinner label="Loading assessment…" />;
  if (phase === 'error') return <div className="max-w-lg mx-auto"><ErrorText>{error}</ErrorText><Link to="/" className="text-xs text-cyan-400 hover:underline mt-4 inline-block">← Back</Link></div>;

  if (phase === 'gate') {
    const minutes = Math.round(a.duration_seconds / 60);
    return (
      <div className="max-w-2xl mx-auto card space-y-5">
        <div>
          <Pill tone="cyan">{KIND_LABEL[a.kind]}</Pill>
          <h1 className="text-xl font-bold text-white mt-2">{a.title}</h1>
          <p className="text-xs text-slate-400 mt-1">{a.question_count} questions · {minutes} minutes · {a.kind === 'skill' ? 'multiple choice' : 'written answers'}</p>
        </div>
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 text-xs text-slate-300">
          <p className="font-semibold text-white flex items-center gap-2"><Lock className="w-4 h-4 text-cyan-400" /> Proctoring rules</p>
          <ul className="list-disc pl-5 space-y-1 text-slate-400">
            <li>The test runs in fullscreen with your webcam on{a.require_camera ? ' (required)' : ''}. Video stays in your browser; only violation events are sent.</li>
            <li>Switching tabs/windows, leaving fullscreen, copy/paste, right-click and developer shortcuts each count as a violation (−5 points each; more than {a.max_violations} voids the test).</li>
            <li>The clock is enforced by the server and starts when you press Start. Refreshing does not pause it.</li>
            <li>Failing, abandoning or timing out triggers a mandatory cool-down before you can retake this item.</li>
            {a.kind !== 'skill' && <li>Defense answers are graded on specifics — generic answers score low. {a.grading_mode === 'heuristic' ? 'Grading mode: heuristic (no AI key configured on this server).' : 'Graded by AI against the rubric.'}</li>}
          </ul>
        </div>
        {a.status === 'active' && <p className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800 rounded-xl px-3 py-2">This test is already in progress — {fmtDuration(a.remaining_seconds)} left. Resuming is logged.</p>}
        <ErrorText>{gateError}</ErrorText>
        <div className="flex items-center justify-between">
          <Link to="/" className="text-xs text-slate-400 hover:text-white">Not now</Link>
          <button className="btn-primary" onClick={start} disabled={starting}><Maximize className="w-4 h-4" /> {starting ? 'Starting…' : a.status === 'active' ? 'Resume test' : 'Start test in fullscreen'}</button>
        </div>
      </div>
    );
  }

  if (phase === 'submitting') return <Spinner label="Grading and issuing your signed credential…" />;

  if (phase === 'result') return <ResultView result={result} a={a} copied={copied} copy={copy} />;

  // ---- running
  const questions = a.questions || [];
  const q = questions[idx];
  const answeredCount = questions.filter((x) => answers[x.id] !== undefined && answers[x.id] !== '').length;
  const setAnswer = (qid, v) => setAnswers((s) => ({ ...s, [qid]: v }));
  const low = remaining <= 60;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col select-none">
      <div className="bg-slate-950 border-b border-slate-800 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" /> <Lock className="w-3.5 h-3.5 text-cyan-400" /> <span className="hidden sm:inline">Active lockdown & proctoring</span>
        </span>
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-2 text-xs font-mono px-3 py-1 rounded-full border ${violations ? 'text-amber-400 bg-amber-950/40 border-amber-800/60' : 'text-emerald-400 bg-emerald-950/40 border-emerald-800/60'}`}>
            <AlertTriangle className="w-3.5 h-3.5" /> Violations {violations}/{a.max_violations}
          </span>
          <span className={`flex items-center gap-2 font-mono text-sm font-bold px-3 py-1 rounded-lg ${low ? 'bg-red-950 text-red-300' : 'bg-slate-800 text-white'}`}>
            <Clock className="w-4 h-4 text-cyan-400" /> {fmtClock(remaining)}
          </span>
        </div>
      </div>

      {proctor.lastWarning && (
        <div className="bg-red-950/90 border-b border-red-800 text-red-200 px-4 py-2 text-xs flex items-center justify-between">
          <span className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-red-400" /> {proctor.lastWarning}. Logged as a violation (−5 points).</span>
          <button onClick={proctor.clearWarning} className="text-red-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[280px_1fr] overflow-hidden">
        <aside className="hidden md:flex flex-col justify-between bg-slate-900/60 p-5 border-r border-slate-800">
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><Camera className="w-4 h-4 text-cyan-400" /> Camera</h4>
            <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-900 aspect-video">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" />
              {!streamRef.current && <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500">No camera</div>}
            </div>
            <dl className="space-y-1.5 text-[11px] font-mono text-slate-400">
              <div className="flex justify-between"><dt>Face tracking</dt><dd className={proctor.faceMode === 'tracking' ? 'text-emerald-400' : 'text-amber-400'}>{proctor.faceMode === 'tracking' ? 'Active' : 'Unavailable*'}</dd></div>
              <div className="flex justify-between"><dt>Clipboard</dt><dd className="text-emerald-400">Locked</dd></div>
              <div className="flex justify-between"><dt>Server clock</dt><dd className="text-emerald-400">Synced</dd></div>
            </dl>
            {proctor.faceMode === 'unsupported' && <p className="text-[10px] text-slate-500">*This browser has no face-detection API; camera presence is still enforced. Use Chrome/Edge for full tracking.</p>}
          </div>
          <div className="text-[11px] text-slate-500">{answeredCount}/{questions.length} answered</div>
        </aside>

        <section className="p-5 sm:p-8 overflow-y-auto flex flex-col">
          <div className="max-w-3xl w-full mx-auto flex-1 flex flex-col">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Question {idx + 1} of {questions.length}</span>
              <span className="font-mono text-cyan-400 truncate ml-4">{a.title}</span>
            </div>
            <div className="flex gap-1.5 mb-6">
              {questions.map((x, i) => (
                <button key={x.id} onClick={() => setIdx(i)} aria-label={`Question ${i + 1}`}
                  className={`h-1.5 flex-1 rounded-full transition ${i === idx ? 'bg-cyan-400' : answers[x.id] !== undefined && answers[x.id] !== '' ? 'bg-cyan-800' : 'bg-slate-800'}`} />
              ))}
            </div>

            <h3 className="text-base md:text-lg font-bold text-white mb-6 whitespace-pre-wrap">{q.prompt}</h3>

            {q.type === 'mcq' ? (
              <div className="space-y-3">
                {q.options.map((opt, i) => {
                  const sel = answers[q.id] === i;
                  return (
                    <button key={i} onClick={() => setAnswer(q.id, i)}
                      className={`w-full text-left p-4 rounded-xl border text-sm transition flex items-center justify-between gap-3 ${sel ? 'bg-cyan-950/60 border-cyan-500 text-white font-medium' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'}`}>
                      <span>{opt}</span>
                      <span className={`w-5 h-5 rounded-full border shrink-0 flex items-center justify-center ${sel ? 'border-cyan-400 bg-cyan-500 text-slate-950' : 'border-slate-700'}`}>{sel && <CheckCircle2 className="w-3.5 h-3.5" />}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div>
                <textarea
                  className="input min-h-[220px] select-text" placeholder="Type your answer — be specific. Pasting is disabled."
                  value={answers[q.id] || ''} onChange={(e) => setAnswer(q.id, e.target.value)}
                  onPaste={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()} autoComplete="off" spellCheck={false} />
                <p className="text-[10px] text-slate-500 mt-1 font-mono">{(answers[q.id] || '').trim().split(/\s+/).filter(Boolean).length} words</p>
              </div>
            )}

            <div className="mt-auto pt-8 flex items-center justify-between">
              <button className="text-xs text-slate-400 hover:text-white disabled:opacity-30 px-3 py-2" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Previous</button>
              <div className="flex items-center gap-3">
                {error && <span className="text-xs text-red-400">{error}</span>}
                {idx === questions.length - 1 ? (
                  <button className="btn-primary" onClick={finish}>Submit & grade{answeredCount < questions.length ? ` (${questions.length - answeredCount} blank)` : ''}</button>
                ) : (
                  <button className="btn-ghost" onClick={() => setIdx(idx + 1)}>Next</button>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      {proctor.fullscreenLost && (
        <div className="absolute inset-0 z-[60] bg-slate-950/95 backdrop-blur flex items-center justify-center p-6 text-center">
          <div className="max-w-sm space-y-4">
            <ShieldAlert className="w-12 h-12 text-amber-400 mx-auto" />
            <h3 className="text-lg font-bold text-white">Fullscreen required</h3>
            <p className="text-xs text-slate-400">Leaving fullscreen was logged as a violation. The clock is still running — return to continue.</p>
            <button className="btn-primary" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}><Maximize className="w-4 h-4" /> Return to fullscreen</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultView({ result, a, copied, copy }) {
  const passed = !!result?.passed;
  const modeLabel = { ai: 'AI evaluator', heuristic: 'Heuristic checker (no AI key on server)', bank: 'Question bank' }[result?.grading_mode];
  return (
    <div className="max-w-2xl mx-auto card text-center space-y-5">
      {passed ? <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto" /> : <XCircle className="w-16 h-16 text-red-400 mx-auto" />}
      <div>
        <h1 className="text-2xl font-bold text-white">{passed ? 'Verified!' : result?.status === 'invalidated' ? 'Test invalidated' : result?.status === 'expired' ? 'Time expired' : 'Not passed'}</h1>
        <p className="text-sm text-slate-400 mt-1">{a?.title}</p>
      </div>

      {result?.score !== undefined && (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-[10px] text-slate-400">FINAL SCORE</div><div className={`text-3xl font-black ${passed ? 'text-emerald-400' : 'text-red-400'}`}>{result.score}%</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-[10px] text-slate-400">VIOLATIONS</div><div className="text-3xl font-black text-amber-400">{result.violations ?? 0}</div>{result.penalty ? <div className="text-[10px] text-slate-500">−{result.penalty} pts</div> : null}</div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-[10px] text-slate-400">RATING</div><div className="text-xl font-black text-cyan-400 mt-1">{result.rating || '—'}</div></div>
        </div>
      )}
      <p className="text-xs text-slate-400">{result?.message}</p>

      {result?.feedback?.length > 0 && (
        <div className="text-left space-y-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Answer feedback</h3>
          {result.feedback.map((f, i) => (
            <div key={f.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-start justify-between gap-3">
              <p className="text-xs text-slate-300">Q{i + 1}: {f.feedback}</p>
              <span className="text-xs font-mono text-cyan-400 shrink-0">{f.score}%</span>
            </div>
          ))}
        </div>
      )}
      {modeLabel && <p className="text-[10px] text-slate-500">Graded by: {modeLabel}</p>}
      {!passed && result?.retry_after_seconds > 0 && <p className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800 rounded-xl px-3 py-2">Cool-down: you can retry this item in about {fmtDuration(result.retry_after_seconds)}.</p>}

      <div className="flex items-center justify-center gap-3 flex-wrap">
        {passed && result.credential_id && (
          <button className="btn-ghost" onClick={() => copy(verifyUrl(result.credential_id), 'v')}><Copy className="w-4 h-4" /> {copied === 'v' ? 'Link copied' : 'Copy verification link'}</button>
        )}
        <Link to="/" className="btn-primary">Back to my profile</Link>
      </div>
    </div>
  );
}
