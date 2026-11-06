import React from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Briefcase, Building2, LogOut, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuth } from '../auth.jsx';

const navCls = ({ isActive }) =>
  `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
    isActive ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-md shadow-cyan-500/10' : 'text-slate-400 hover:text-white'}`;

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <ShieldCheck className="w-6 h-6 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
                <span>Verific<span className="text-cyan-400">Link</span></span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono uppercase font-semibold hidden sm:inline">Verified Only</span>
              </span>
              <p className="text-xs text-slate-400 hidden md:block">Proof of Competency & Anti-Fraud Network</p>
            </div>
          </Link>

          {user ? (
            <div className="flex items-center gap-3">
              <nav className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1">
                {user.role === 'candidate' ? (
                  <>
                    <NavLink to="/" end className={navCls}><UserCheck className="w-3.5 h-3.5" /> My Proof</NavLink>
                    <NavLink to="/jobs" className={navCls}><Briefcase className="w-3.5 h-3.5" /> Jobs</NavLink>
                  </>
                ) : (
                  <NavLink to="/" end className={navCls}><Building2 className="w-3.5 h-3.5" /> Recruiter Hub</NavLink>
                )}
              </nav>
              <div className="hidden md:block text-right leading-tight">
                <div className="text-xs font-semibold text-white">{user.name}</div>
                <div className="text-[10px] text-slate-500">{user.role === 'recruiter' ? user.company_name : 'Candidate'}</div>
              </div>
              <button onClick={() => { logout(); navigate('/login'); }} title="Sign out" className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link to="/login" className="btn-ghost !py-1.5 !text-xs">Sign in</Link>
          )}
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
