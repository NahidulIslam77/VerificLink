import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

const GRADIENTS = [
  'from-cyan-500 to-blue-600', 'from-indigo-500 to-purple-600', 'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600', 'from-pink-500 to-rose-600', 'from-sky-500 to-indigo-600',
];

export function Avatar({ name = '?', size = 'w-14 h-14', text = 'text-lg' }) {
  const initials = name.replace(/^(dr|prof)\.?\s+/i, '').split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <div className={`${size} ${text} rounded-xl bg-gradient-to-br ${GRADIENTS[hash % GRADIENTS.length]} flex items-center justify-center font-bold text-white shrink-0 ring-1 ring-white/10`}>
      {initials || '?'}
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-slate-400 text-sm">
      <Loader2 className="w-5 h-5 animate-spin text-cyan-400" /> {label}
    </div>
  );
}

export function ErrorText({ children }) {
  if (!children) return null;
  return (
    <div className="flex items-start gap-2 bg-red-950/50 border border-red-900 text-red-200 text-xs rounded-xl px-3 py-2">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
      <span>{children}</span>
    </div>
  );
}

export function Modal({ title, subtitle, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`bg-slate-900 border border-slate-800 w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto`}>
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
        {title && <h3 className="text-lg font-bold text-white pr-8">{title}</h3>}
        {subtitle && <p className="text-xs text-slate-400 mt-1 mb-5">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export function Pill({ children, tone = 'slate', title }) {
  const tones = {
    slate: 'bg-slate-800 text-slate-300 border-slate-700',
    cyan: 'bg-cyan-950 text-cyan-300 border-cyan-800',
    blue: 'bg-blue-950 text-blue-300 border-blue-800',
    emerald: 'bg-emerald-950 text-emerald-400 border-emerald-800',
    indigo: 'bg-indigo-950 text-indigo-300 border-indigo-800',
    amber: 'bg-amber-950 text-amber-300 border-amber-800',
    red: 'bg-red-950 text-red-300 border-red-800',
  };
  return <span title={title} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tones[tone]}`}>{children}</span>;
}

export function Bar({ label, value, tone = 'bg-cyan-500', note }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-slate-400 mb-1"><span>{label}</span><span className="font-mono">{note ?? `${value}%`}</span></div>
      <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
        <div className={`${tone} h-full rounded-full transition-all`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export const matchTone = (s) => (s >= 85 ? 'text-emerald-400' : s >= 65 ? 'text-cyan-400' : s >= 40 ? 'text-amber-400' : 'text-slate-400');

export const fmtDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

export function ratingTone(r) { return r === 'Expert' ? 'cyan' : 'blue'; }

export function useCopy() {
  const [copied, setCopied] = useState(null);
  const copy = async (text, id) => {
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable */ }
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };
  return [copied, copy];
}

export const verifyUrl = (id) => `${window.location.origin}/verify/${id}`;

export function fmtDuration(secs) {
  const m = Math.ceil(secs / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}
