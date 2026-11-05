import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Server, Cpu, CheckCircle2, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';

export const Settings: React.FC = () => {
  const { data: sysInfo } = useQuery({
    queryKey: ['system-info'],
    queryFn: () => api.getSystemInfo(),
  });

  const { data: readyData } = useQuery({
    queryKey: ['system-ready'],
    queryFn: () => api.getReady(),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100 tracking-tight">System Infrastructure & Settings</h1>
        <p className="text-xs text-slate-400 font-mono">
          Operational dependency statuses, vector backend indicators, and environment configuration.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Core Infrastructure */}
        <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-center space-x-2 border-b border-border pb-3">
            <Server className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider font-mono text-slate-200">
              Core Runtime Environment
            </h2>
          </div>

          <div className="space-y-3 text-xs font-mono">
            <div className="flex justify-between items-center p-2.5 bg-surface-elevated rounded border border-border">
              <span className="text-slate-400">Environment Mode:</span>
              <span className="px-2 py-0.5 rounded uppercase font-bold text-blue-300 bg-blue-950 border border-blue-800">
                {sysInfo?.environment || 'development'}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 bg-surface-elevated rounded border border-border">
              <span className="text-slate-400">Database Engine:</span>
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-slate-200 font-semibold uppercase">
                  {sysInfo?.database.backend || 'sqlite'} ({sysInfo?.database.status || 'healthy'})
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center p-2.5 bg-surface-elevated rounded border border-border">
              <span className="text-slate-400">Server UTC Time:</span>
              <span className="text-slate-300">{sysInfo?.server_time ? new Date(sysInfo.server_time).toUTCString() : '-'}</span>
            </div>
          </div>
        </div>

        {/* AI & Vector Subsystems */}
        <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-center space-x-2 border-b border-border pb-3">
            <Cpu className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider font-mono text-slate-200">
              Diagnostic & AI Vector Stack
            </h2>
          </div>

          <div className="space-y-3 text-xs font-mono">
            <div className="flex justify-between items-center p-2.5 bg-surface-elevated rounded border border-border">
              <span className="text-slate-400">Active Vector Store:</span>
              <span className="text-emerald-400 font-semibold">
                {sysInfo?.vector_backend || 'in_process_cosine_similarity'}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 bg-surface-elevated rounded border border-border">
              <span className="text-slate-400">LLM Mode:</span>
              <span className="text-slate-300">
                {sysInfo?.llm_enabled ? `Enabled (${sysInfo.llm_model})` : 'Deterministic Rules Fallback (Zero-Key)'}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 bg-surface-elevated rounded border border-border">
              <span className="text-slate-400">Redis Coordination:</span>
              <span className="text-slate-400">
                {readyData?.redis === 'unreachable' ? 'Unreachable' : 'Not Configured (In-Process Fallback Active)'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Security Principles Checklist */}
      <div className="bg-surface border border-border rounded-lg p-5 space-y-3">
        <div className="flex items-center space-x-2 text-xs font-mono uppercase tracking-wider text-slate-300">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h3 className="font-semibold">Security & Ground-Truth Invariants Enforced</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
          <div className="p-3 bg-surface-elevated border border-border rounded flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-slate-300">
              <strong>Ground-Truth Isolation:</strong> Evaluator labels and expected actions are completely hidden from diagnosis prompts, agent states, and database queries.
            </div>
          </div>
          <div className="p-3 bg-surface-elevated border border-border rounded flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-slate-300">
              <strong>Server-Authoritative RBAC:</strong> Roles are read exclusively from the database user record, never trusted from client-supplied JWT claims.
            </div>
          </div>
          <div className="p-3 bg-surface-elevated border border-border rounded flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-slate-300">
              <strong>Separation of Duties:</strong> High-risk remediation proposals require approval from a distinct Incident Commander or Admin.
            </div>
          </div>
          <div className="p-3 bg-surface-elevated border border-border rounded flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-slate-300">
              <strong>Idempotent Execution:</strong> Duplicate remediation executions return original outcomes without side-effects.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
