import React from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Activity,
  Layers,
  Wrench,
  Search,
  BookOpen,
  BarChart2,
  Settings,
  Shield,
  LogOut,
  Server,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/', label: 'Overview', icon: Activity },
    { to: '/incidents', label: 'Incident Explorer', icon: AlertTriangle },
    { to: '/remediations', label: 'Remediation Center', icon: Wrench },
    { to: '/evidence', label: 'Evidence Explorer', icon: Search },
    { to: '/services', label: 'Service Map', icon: Layers },
    { to: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
    { to: '/evaluations', label: 'Evaluation Center', icon: BarChart2 },
    { to: '/audit', label: 'Audit Trail', icon: Shield },
    { to: '/settings', label: 'System Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col text-slate-200">
      {/* Top Banner - Prominent Synthetic & Simulation Notice */}
      <header className="bg-surface border-b border-border px-4 py-2 flex items-center justify-between text-xs sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <Link to="/" className="flex items-center space-x-2 font-bold text-sm text-blue-400 hover:text-blue-300">
            <Server className="w-5 h-5 text-blue-500" />
            <span className="tracking-wide">IncidentIQ</span>
          </Link>
          <span className="text-slate-600">|</span>
          <div className="flex items-center space-x-2 font-mono text-[11px] text-amber-400/90 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
            <span>SYNTHETIC TELEMETRY • SIMULATED REMEDIATION</span>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 text-xs">Actor:</span>
            <span className="font-mono text-xs text-slate-200 font-semibold">{user?.username}</span>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono uppercase bg-blue-950 text-blue-300 border border-blue-800">
              {user?.role}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center space-x-1 text-slate-400 hover:text-slate-100 transition-colors p-1"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar Nav */}
        <aside className="w-64 bg-surface border-r border-border p-3 flex flex-col justify-between shrink-0">
          <nav className="space-y-1">
            <div className="px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-slate-500">
              Operations & SRE
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center space-x-3 px-3 py-2 rounded text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary/20 text-blue-400 border border-primary/40'
                        : 'text-slate-400 hover:bg-surface-elevated hover:text-slate-200'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          {/* System status footer */}
          <div className="p-3 bg-surface-elevated/60 border border-border/80 rounded text-xs space-y-1 font-mono">
            <div className="flex justify-between text-slate-400">
              <span>Database:</span>
              <span className="text-emerald-400 font-semibold">Active</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Diagnosis:</span>
              <span className="text-blue-400 font-semibold">Deterministic</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Confidence:</span>
              <span className="text-slate-400 text-[10px]">Heuristic Score</span>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
