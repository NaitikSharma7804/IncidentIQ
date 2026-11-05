import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Login: React.FC = () => {
  const { login, loading } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('demo-engineer');
  const [password, setPassword] = useState('demo-only');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(username, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  };

  const handleQuickLogin = async (userRole: string) => {
    setError(null);
    try {
      await login(`demo-${userRole}`, 'demo-only');
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-surface border border-border rounded-lg shadow-2xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-blue-950/60 border border-blue-800 rounded-full text-blue-400">
            <Server className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">IncidentIQ SRE Portal</h1>
          <p className="text-xs text-slate-400">Autonomous Incident Diagnosis & Remediation Platform</p>
        </div>

        {error && (
          <div className="p-3 bg-red-950/50 border border-red-800 rounded flex items-center space-x-2 text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Quick Demo Login Cards */}
        <div className="space-y-2">
          <label className="text-xs font-mono uppercase tracking-wider text-slate-400 block">
            Quick Demo Login (Dev Roles)
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <button
              type="button"
              onClick={() => handleQuickLogin('viewer')}
              disabled={loading}
              className="p-2.5 bg-surface-elevated hover:bg-slate-800 border border-border rounded text-left transition-colors flex flex-col justify-between"
            >
              <span className="font-semibold text-slate-200">Viewer</span>
              <span className="text-[10px] text-slate-400">Read-only inspection</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('engineer')}
              disabled={loading}
              className="p-2.5 bg-surface-elevated hover:bg-slate-800 border border-border rounded text-left transition-colors flex flex-col justify-between"
            >
              <span className="font-semibold text-blue-300">Engineer</span>
              <span className="text-[10px] text-slate-400">Investigate & execute</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('incident_commander')}
              disabled={loading}
              className="p-2.5 bg-surface-elevated hover:bg-slate-800 border border-border rounded text-left transition-colors flex flex-col justify-between"
            >
              <span className="font-semibold text-amber-300">Commander</span>
              <span className="text-[10px] text-slate-400">High-risk approvals</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('admin')}
              disabled={loading}
              className="p-2.5 bg-surface-elevated hover:bg-slate-800 border border-border rounded text-left transition-colors flex flex-col justify-between"
            >
              <span className="font-semibold text-emerald-300">Admin</span>
              <span className="text-[10px] text-slate-400">Evaluations & policy</span>
            </button>
          </div>
        </div>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase font-mono">
            <span className="bg-surface px-2 text-slate-500">Or Custom Credentials</span>
          </div>
        </div>

        {/* Standard Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-mono text-slate-300 block mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded text-sm text-slate-200 focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-slate-300 block mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded text-sm text-slate-200 focus:outline-none focus:border-primary"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded transition-colors flex items-center justify-center space-x-2"
          >
            <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="text-[11px] font-mono text-slate-500 text-center border-t border-border/80 pt-4">
          Argon2 password hashing & server-authoritative RBAC active.
        </div>
      </div>
    </div>
  );
};
