import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wrench,
  ShieldAlert,
  CheckCircle,
  Play,
  Check,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { api } from '../api/client';
import type { AuditEvent } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';

export const RemediationCenter: React.FC = () => {
  const queryClient = useQueryClient();
  const { user, canApprove, canExecute } = useAuth();
  const [activeTab, setActiveTab] = useState<'actions' | 'audit'>('actions');
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch incidents to gather their remediations
  const { data: incidentsData } = useQuery({
    queryKey: ['incidents-for-remediations'],
    queryFn: () => api.getIncidents({ limit: 50 }),
  });

  // Fetch audit events
  const { data: auditEvents } = useQuery({
    queryKey: ['audit-events-remediation'],
    queryFn: () => api.getAuditEvents(),
  });

  // In a real multi-incident setup, we fetch remediations for active incidents
  const incidents = incidentsData?.items || [];
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>('');

  // Default to first incident if not selected
  const activeIncidentId = selectedIncidentId || (incidents.length > 0 ? incidents[0].id : '');

  const { data: remediations, isLoading: loadingRemediations } = useQuery({
    queryKey: ['remediations-list', activeIncidentId],
    queryFn: () => api.getRemediations(activeIncidentId),
    enabled: !!activeIncidentId,
  });

  // Approve Mutation
  const approveMutation = useMutation({
    mutationFn: ({ iid, rid }: { iid: string; rid: string }) => api.approveRemediation(iid, rid),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['remediations-list', activeIncidentId] });
      queryClient.invalidateQueries({ queryKey: ['audit-events-remediation'] });
    },
    onError: (err: any) => setActionError(err.message || 'Approval failed'),
  });

  // Reject Mutation
  const rejectMutation = useMutation({
    mutationFn: ({ iid, rid }: { iid: string; rid: string }) => api.rejectRemediation(iid, rid, 'Rejected by operator'),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['remediations-list', activeIncidentId] });
      queryClient.invalidateQueries({ queryKey: ['audit-events-remediation'] });
    },
    onError: (err: any) => setActionError(err.message || 'Rejection failed'),
  });

  // Execute Mutation
  const executeMutation = useMutation({
    mutationFn: ({ iid, rid }: { iid: string; rid: string }) => api.executeRemediation(iid, rid),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['remediations-list', activeIncidentId] });
      queryClient.invalidateQueries({ queryKey: ['audit-events-remediation'] });
    },
    onError: (err: any) => setActionError(err.message || 'Execution failed'),
  });

  // Verify Mutation
  const verifyMutation = useMutation({
    mutationFn: ({ iid, rid }: { iid: string; rid: string }) => api.verifyRemediation(iid, rid),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['remediations-list', activeIncidentId] });
      queryClient.invalidateQueries({ queryKey: ['audit-events-remediation'] });
    },
    onError: (err: any) => setActionError(err.message || 'Verification failed'),
  });

  return (
    <div className="space-y-6">
      {/* Prominent Simulated Banner */}
      <div className="bg-amber-950/40 border border-amber-600/60 rounded-lg p-4 flex items-center justify-between text-amber-300">
        <div className="flex items-center space-x-3">
          <ShieldAlert className="w-6 h-6 text-amber-400 shrink-0" />
          <div>
            <div className="font-bold text-sm tracking-wide font-mono uppercase">
              Simulated Remediation Sandbox Active
            </div>
            <div className="text-xs text-amber-200/80">
              All infrastructure modifications (pool sizing, restarts, cache evictions, rollbacks) run against simulated state machines. Real database records remain safe.
            </div>
          </div>
        </div>
        <span className="px-3 py-1 bg-amber-900/60 border border-amber-700 rounded text-xs font-mono font-bold uppercase">
          100% Simulated
        </span>
      </div>

      {actionError && (
        <div className="p-3 bg-red-950/70 border border-red-800 rounded flex items-center space-x-2 text-red-300 text-xs font-mono">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Incident Selector & Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center space-x-3 text-xs font-mono">
          <label className="text-slate-400 uppercase">Target Incident:</label>
          <select
            value={activeIncidentId}
            onChange={(e) => {
              setSelectedIncidentId(e.target.value);
              setActionError(null);
            }}
            className="px-3 py-1.5 bg-surface-elevated border border-border rounded text-slate-200"
          >
            {incidents.map((inc) => (
              <option key={inc.id} value={inc.id}>
                {inc.id} - {inc.title} ({inc.status})
              </option>
            ))}
          </select>
        </div>

        <div className="flex border-b border-border space-x-4 text-xs font-mono">
          <button
            onClick={() => setActiveTab('actions')}
            className={`pb-2 font-semibold transition-colors border-b-2 ${
              activeTab === 'actions' ? 'border-primary text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Remediation Actions ({remediations?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-2 font-semibold transition-colors border-b-2 ${
              activeTab === 'audit' ? 'border-primary text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Security Audit Trail ({auditEvents?.length || 0})
          </button>
        </div>
      </div>

      {/* Tab 1: Remediation Actions */}
      {activeTab === 'actions' && (
        <div className="space-y-4">
          {loadingRemediations ? (
            <div className="p-8 text-center text-slate-400 font-mono text-xs">Loading remediations...</div>
          ) : remediations && remediations.length > 0 ? (
            remediations.map((action) => {
              const isHighRisk = action.risk === 'high';
              const isSelfRequester = user?.username === action.requester;
              const canUserApproveThis = canApprove && !(isHighRisk && isSelfRequester);

              return (
                <div key={action.id} className="bg-surface border border-border rounded-lg p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-sm font-bold text-slate-100">{action.action}</span>
                        <StatusBadge type="risk" value={action.risk} />
                        <StatusBadge type="approval" value={action.approval} />
                        <StatusBadge type="status" value={action.status} />
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        Target Service: <strong className="text-slate-200">{action.service}</strong> | Requester:{' '}
                        <span className="text-slate-300 font-mono">{action.requester}</span>
                      </div>
                    </div>

                    {/* Operational Action Controls */}
                    <div className="flex items-center space-x-2">
                      {action.approval === 'pending' && (
                        <>
                          <button
                            onClick={() => approveMutation.mutate({ iid: activeIncidentId, rid: action.id })}
                            disabled={!canUserApproveThis || approveMutation.isPending}
                            className={`px-3 py-1.5 rounded text-xs font-mono font-semibold flex items-center space-x-1.5 transition-colors ${
                              canUserApproveThis
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                            title={
                              isHighRisk && isSelfRequester
                                ? 'Separation of duties: Cannot approve your own high-risk proposal'
                                : 'Approve proposal'
                            }
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>

                          <button
                            onClick={() => rejectMutation.mutate({ iid: activeIncidentId, rid: action.id })}
                            disabled={!canApprove || rejectMutation.isPending}
                            className="px-3 py-1.5 bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-300 rounded text-xs font-mono transition-colors"
                          >
                            Reject
                          </button>
                        </>
                      )}

                      {action.status === 'proposed' && (action.approval === 'approved' || action.approval === 'not_required') && (
                        <button
                          onClick={() => executeMutation.mutate({ iid: activeIncidentId, rid: action.id })}
                          disabled={!canExecute || executeMutation.isPending}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-mono font-semibold flex items-center space-x-1.5 transition-colors"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Execute Action</span>
                        </button>
                      )}

                      {action.status === 'executed' && !action.verification && (
                        <button
                          onClick={() => verifyMutation.mutate({ iid: activeIncidentId, rid: action.id })}
                          disabled={verifyMutation.isPending}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-mono font-semibold flex items-center space-x-1.5 transition-colors"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Verify Infrastructure State</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Separation of duties warning */}
                  {isHighRisk && isSelfRequester && action.approval === 'pending' && (
                    <div className="p-2 bg-amber-950/30 border border-amber-800/60 rounded text-[11px] font-mono text-amber-300 flex items-center space-x-2">
                      <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        Separation of Duties Enforced: As requester, you cannot approve your own high-risk action.
                        Another Incident Commander or Admin must authorize.
                      </span>
                    </div>
                  )}

                  {/* Parameters & Verification Status */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                    <div className="p-3 bg-surface-elevated border border-border rounded space-y-1">
                      <span className="text-slate-400 text-[11px] block uppercase">Action Parameters</span>
                      <pre className="text-blue-300 text-[11px] overflow-x-auto">
                        {JSON.stringify(action.params, null, 2)}
                      </pre>
                    </div>

                    <div className="p-3 bg-surface-elevated border border-border rounded space-y-2">
                      <span className="text-slate-400 text-[11px] block uppercase">Verification Verdict</span>
                      {action.verification ? (
                        <div className="flex items-center space-x-2">
                          <StatusBadge type="verification" value={action.verification} />
                          <span className="text-slate-300 text-xs">
                            {action.verification === 'recovered'
                              ? 'Telemetry confirmed recovered under post-remediation checks.'
                              : 'Infrastructure anomaly persists after action.'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">Awaiting execution & verification test.</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-12 bg-surface border border-border rounded-lg text-center space-y-2">
              <Wrench className="w-8 h-8 text-slate-600 mx-auto" />
              <div className="text-sm font-semibold text-slate-300">No Remediation Proposals for this Incident</div>
              <p className="text-xs text-slate-500 font-mono">
                Run an investigation in the Incident Workspace to automatically formulate a validated remediation plan.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Security Audit Trail */}
      {activeTab === 'audit' && (
        <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center text-xs font-mono">
            <h3 className="font-semibold text-slate-200">Immutable Security Audit Events</h3>
            <span className="text-slate-400">{auditEvents?.length || 0} Events Persisted</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-300 font-mono">
              <thead className="bg-surface-elevated text-slate-400 uppercase text-[11px]">
                <tr>
                  <th className="p-2.5">Timestamp</th>
                  <th className="p-2.5">Actor</th>
                  <th className="p-2.5">Action</th>
                  <th className="p-2.5">Outcome</th>
                  <th className="p-2.5">Resource ID</th>
                  <th className="p-2.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(auditEvents || []).map((ev: AuditEvent) => (
                  <tr key={ev.id} className="hover:bg-surface-elevated/50">
                    <td className="p-2.5 text-slate-400">{new Date(ev.timestamp).toLocaleTimeString()}</td>
                    <td className="p-2.5 text-blue-400 font-semibold">{ev.actor}</td>
                    <td className="p-2.5 uppercase text-slate-300">{ev.action}</td>
                    <td className="p-2.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                          ev.outcome === 'ok'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : ev.outcome.startsWith('denied')
                            ? 'bg-red-950 text-red-300 border border-red-800'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {ev.outcome}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-400 truncate max-w-[120px]">{ev.resource_id || '-'}</td>
                    <td className="p-2.5 text-slate-400 truncate max-w-xs">{JSON.stringify(ev.details || {})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
