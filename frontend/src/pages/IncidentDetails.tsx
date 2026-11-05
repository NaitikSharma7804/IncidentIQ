import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play,
  BookOpen,
  ArrowRight,
  Terminal,
} from 'lucide-react';
import { api } from '../api/client';
import type { InvestigationReport } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';

export const IncidentDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { canInvestigate } = useAuth();

  const [activeTab, setActiveTab] = useState<'workspace' | 'telemetry' | 'timeline'>('workspace');
  const [selectedMode, setSelectedMode] = useState<string>('deterministic_rules');
  const [patchError, setPatchError] = useState<string | null>(null);

  // Fetch Incident
  const { data: incident, isLoading: loadingIncident } = useQuery({
    queryKey: ['incident', id],
    queryFn: () => api.getIncident(id!),
    enabled: !!id,
  });

  // Fetch Telemetry
  const { data: telemetry } = useQuery({
    queryKey: ['incident-telemetry', id],
    queryFn: () => api.getIncidentTelemetry(id!),
    enabled: !!id,
  });

  // Fetch Investigations for this incident
  const { data: investigationsList } = useQuery({
    queryKey: ['incident-investigations', id],
    queryFn: () => api.getInvestigations(id!),
    enabled: !!id,
  });

  // Fetch latest investigation detail if available
  const latestInvId = investigationsList && investigationsList.length > 0 ? investigationsList[0].id : null;
  const { data: investigationDetail } = useQuery({
    queryKey: ['investigation-detail', latestInvId],
    queryFn: () => api.getInvestigation(latestInvId!),
    enabled: !!latestInvId,
  });

  // Mutation to Run Investigation
  const investigateMutation = useMutation({
    mutationFn: () => api.investigateIncident(id!, selectedMode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident-investigations', id] });
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      queryClient.invalidateQueries({ queryKey: ['incidents-overview'] });
    },
  });

  // Mutation to Patch Incident Status
  const patchMutation = useMutation({
    mutationFn: (newStatus: string) => api.patchIncident(id!, { status: newStatus }),
    onSuccess: () => {
      setPatchError(null);
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      queryClient.invalidateQueries({ queryKey: ['incidents-list'] });
    },
    onError: (err: any) => {
      setPatchError(err.message || 'Transition failed');
    },
  });

  if (loadingIncident) {
    return <div className="p-8 text-center text-slate-400 font-mono text-xs">Loading incident {id}...</div>;
  }

  if (!incident) {
    return <div className="p-8 text-center text-red-400 font-mono text-xs">Incident {id} not found.</div>;
  }

  const report: InvestigationReport | undefined = investigationDetail || (investigateMutation.data as InvestigationReport);

  return (
    <div className="space-y-6">
      {/* Header & Meta */}
      <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs font-bold text-blue-400">{incident.id}</span>
              <StatusBadge type="severity" value={incident.severity} />
              <StatusBadge type="status" value={incident.status} />
              {incident.synthetic && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-950/60 text-amber-300 border border-amber-800">
                  Synthetic Scenario
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-100">{incident.title}</h1>
            <div className="text-xs text-slate-400 font-mono flex items-center space-x-4">
              <span>Service: <strong className="text-slate-200">{incident.service}</strong></span>
              <span>Detected: <strong className="text-slate-200">{new Date(incident.detected_at).toLocaleString()}</strong></span>
              {incident.resolved_at && (
                <span>Resolved: <strong className="text-emerald-400">{new Date(incident.resolved_at).toLocaleString()}</strong></span>
              )}
            </div>
          </div>

          {/* Incident State Transitions */}
          <div className="flex flex-col items-end space-y-2">
            <div className="flex items-center space-x-2">
              <label className="text-[11px] font-mono text-slate-400 uppercase">State:</label>
              <select
                value={incident.status}
                onChange={(e) => patchMutation.mutate(e.target.value)}
                disabled={patchMutation.isPending || !canInvestigate}
                className="px-2.5 py-1 bg-surface-elevated border border-border rounded text-xs font-mono text-slate-200 focus:outline-none focus:border-primary"
              >
                <option value="open">open</option>
                <option value="investigating">investigating</option>
                <option value="remediating">remediating</option>
                <option value="resolved">resolved</option>
                <option value="closed">closed</option>
              </select>
            </div>
            {patchError && <span className="text-[11px] text-red-400 font-mono">{patchError}</span>}
          </div>
        </div>

        {/* AI Investigation Controls */}
        <div className="pt-3 border-t border-border flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center space-x-3 text-xs font-mono">
            <span className="text-slate-400">Diagnosis Engine:</span>
            <select
              value={selectedMode}
              onChange={(e) => setSelectedMode(e.target.value)}
              className="px-2.5 py-1 bg-surface-elevated border border-border rounded text-slate-200"
            >
              <option value="deterministic_rules">Deterministic Rule-Based (Zero-Key Fallback)</option>
              <option value="retrieval_assisted">Retrieval-Assisted (Runbooks RAG)</option>
              <option value="llm_assisted">LLM-Assisted (OpenAI-compatible Agent)</option>
            </select>
          </div>

          {canInvestigate && (
            <button
              onClick={() => investigateMutation.mutate()}
              disabled={investigateMutation.isPending}
              className="flex items-center space-x-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-mono font-semibold transition-colors"
            >
              <Play className={`w-3.5 h-3.5 ${investigateMutation.isPending ? 'animate-spin' : ''}`} />
              <span>{investigateMutation.isPending ? 'Running Agent Graph...' : 'Run Autonomous Diagnosis'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border space-x-6 text-xs font-mono">
        <button
          onClick={() => setActiveTab('workspace')}
          className={`pb-2.5 font-semibold transition-colors border-b-2 ${
            activeTab === 'workspace' ? 'border-primary text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Investigation Workspace & AI Diagnostics
        </button>
        <button
          onClick={() => setActiveTab('telemetry')}
          className={`pb-2.5 font-semibold transition-colors border-b-2 ${
            activeTab === 'telemetry' ? 'border-primary text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Raw Telemetry Records ({telemetry?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`pb-2.5 font-semibold transition-colors border-b-2 ${
            activeTab === 'timeline' ? 'border-primary text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Incident Causal Timeline
        </button>
      </div>

      {/* Tab 1: Investigation Workspace */}
      {activeTab === 'workspace' && (
        <div className="space-y-6">
          {report ? (
            <>
              {/* Agent Pipeline Stages */}
              <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center text-xs font-mono">
                  <h3 className="font-semibold text-slate-200 uppercase tracking-wider">
                    LangGraph Agent Execution Pipeline
                  </h3>
                  <span className="text-slate-400">Total Duration: <strong>{report.duration_ms}ms</strong></span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {(report.stages || []).map((st, i) => (
                    <div key={i} className="p-2.5 bg-surface-elevated border border-border rounded text-xs font-mono space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[10px]">#{i + 1}</span>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.status === 'ok' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      </div>
                      <div className="font-semibold text-slate-200 truncate capitalize">
                        {st.name.replace('_', ' ')}
                      </div>
                      <div className="text-[10px] text-slate-400">{st.ms}ms</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Diagnosis and Remediation Proposal */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Root Cause Card */}
                <div className="bg-surface border border-border rounded-lg p-5 space-y-3 lg:col-span-2">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-slate-200 font-mono uppercase tracking-wider">
                      Authoritative Root Cause Finding
                    </h3>
                    <StatusBadge type="status" value={report.status} />
                  </div>

                  <div className="p-4 bg-surface-elevated border border-border rounded space-y-2">
                    <div className="text-lg font-bold font-mono text-blue-400">
                      {report.root_cause ? report.root_cause.replace(/_/g, ' ') : 'Inconclusive (Insufficient Telemetry)'}
                    </div>
                    <div className="text-xs text-slate-300">
                      {report.reason || 'Sufficient cross-telemetry corroboration and temporal causal ordering verified.'}
                    </div>
                    <div className="pt-2 text-[11px] font-mono text-slate-400 border-t border-border/80 flex items-center justify-between">
                      <span>Confidence Kind: <strong className="text-slate-300">Heuristic Evidence Coverage</strong></span>
                      <span className="text-amber-400/90">(Not a calibrated probability)</span>
                    </div>
                  </div>

                  {/* Ranked Hypotheses */}
                  <div className="space-y-2 pt-2">
                    <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">
                      Evaluated Hypotheses & Evidence Signals
                    </h4>
                    <div className="space-y-2">
                      {(report.hypotheses || []).map((hyp) => (
                        <div key={hyp.id} className="p-3 bg-surface-elevated/70 border border-border rounded text-xs space-y-2">
                          <div className="flex justify-between items-center font-mono">
                            <span className="font-semibold text-slate-200">
                              #{hyp.rank} {hyp.category.replace(/_/g, ' ')}
                            </span>
                            <div className="flex items-center space-x-2">
                              <span className="text-slate-400">Score: {Math.round(hyp.confidence * 100)}%</span>
                              <StatusBadge type="status" value={hyp.status} />
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-400">{hyp.explanation}</p>
                          <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                            {hyp.supporting_evidence.map((eid) => (
                              <span key={eid} className="px-1.5 py-0.5 bg-emerald-950/60 text-emerald-300 border border-emerald-800 rounded">
                                + {eid}
                              </span>
                            ))}
                            {hyp.contradicting_evidence.map((eid) => (
                              <span key={eid} className="px-1.5 py-0.5 bg-red-950/60 text-red-300 border border-red-800 rounded">
                                - {eid}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Remediation Action Proposal */}
                <div className="bg-surface border border-border rounded-lg p-5 space-y-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-semibold text-slate-200 font-mono uppercase tracking-wider">
                        Recommended Remediation
                      </h3>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-950 text-amber-300 border border-amber-800">
                        Simulated
                      </span>
                    </div>

                    {report.remediation ? (
                      <div className="p-3 bg-surface-elevated border border-border rounded space-y-3 font-mono text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Action:</span>
                          <span className="font-bold text-slate-200">{report.remediation.action}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Target Service:</span>
                          <span className="text-slate-200">{report.remediation.service}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Risk Assessment:</span>
                          <StatusBadge type="risk" value={report.remediation.risk} />
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-1">Parameters:</span>
                          <pre className="p-2 bg-slate-950 border border-border rounded text-[11px] text-blue-300 overflow-x-auto">
                            {JSON.stringify(report.remediation.params, null, 2)}
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 text-center text-slate-500 font-mono text-xs">
                        No remediation action proposed (diagnosis inconclusive or non-actionable).
                      </div>
                    )}
                  </div>

                  {report.remediation_proposal && (
                    <Link
                      to="/remediations"
                      className="w-full py-2 bg-primary hover:bg-primary-hover text-white rounded text-xs font-mono font-semibold flex items-center justify-center space-x-1 transition-colors"
                    >
                      <span>Go to Remediation Center to Authorize</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              </div>

              {/* Retrieved Knowledge Sources (RAG) */}
              {report.knowledge_sources && report.knowledge_sources.length > 0 && (
                <div className="bg-surface border border-border rounded-lg p-5 space-y-3">
                  <div className="flex items-center space-x-2 text-xs font-mono text-slate-300">
                    <BookOpen className="w-4 h-4 text-blue-400" />
                    <h3 className="font-semibold uppercase tracking-wider">
                      Retrieved Knowledge & Runbook Guidance ({report.knowledge_sources.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
                    {report.knowledge_sources.map((ks, i) => (
                      <div key={i} className="p-3 bg-surface-elevated border border-border rounded space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-200 truncate">{ks.document_title || ks.id}</span>
                          <span className="text-[10px] text-blue-400">
                            Sim: {Math.round((ks.similarity_score || 0) * 100)}%
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-3 italic">"{ks.excerpt}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-12 bg-surface border border-border rounded-lg text-center space-y-3">
              <Terminal className="w-10 h-10 text-slate-600 mx-auto" />
              <div className="text-sm font-semibold text-slate-300">No AI Diagnosis Executed Yet</div>
              <p className="text-xs text-slate-500 font-mono max-w-md mx-auto">
                Trigger autonomous investigation above to execute the LangGraph state machine across telemetry records, rule signatures, and knowledge runbooks.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Raw Telemetry */}
      {activeTab === 'telemetry' && (
        <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center text-xs font-mono">
            <h3 className="font-semibold text-slate-200">Raw Observables in Diagnostic Scope</h3>
            <span className="text-slate-400">{telemetry?.length || 0} Records</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-300 font-mono">
              <thead className="bg-surface-elevated text-slate-400 uppercase text-[11px]">
                <tr>
                  <th className="p-2.5">Evidence ID</th>
                  <th className="p-2.5">Type</th>
                  <th className="p-2.5">Service</th>
                  <th className="p-2.5">Timestamp</th>
                  <th className="p-2.5">Payload Excerpt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(telemetry || []).map((t) => (
                  <tr key={t.id} className="hover:bg-surface-elevated/50">
                    <td className="p-2.5 text-blue-400">ev:{t.id}</td>
                    <td className="p-2.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] uppercase bg-slate-800 text-slate-300">
                        {t.source_type}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-300">{t.service}</td>
                    <td className="p-2.5 text-slate-400">{t.timestamp}</td>
                    <td className="p-2.5 text-slate-200 max-w-md truncate">
                      {t.source_type === 'log'
                        ? t.payload.msg
                        : t.source_type === 'metric'
                        ? `${t.payload.name} = ${t.payload.value}`
                        : `Deploy: ${t.payload.changes?.join(', ')}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Timeline */}
      {activeTab === 'timeline' && (
        <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
          <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-200">
            Temporal Sequence of Anomalies
          </h3>
          <div className="relative border-l border-slate-700 ml-4 space-y-6">
            {(report?.timeline || (telemetry || []).slice(0, 15)).map((item: any, i) => (
              <div key={i} className="relative pl-6">
                <span className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-blue-500 border border-slate-900" />
                <div className="text-xs font-mono text-slate-400">{item.timestamp}</div>
                <div className="text-xs font-semibold text-slate-200 font-mono mt-0.5">{item.evidence_id || `ev:${item.id}`}</div>
                <div className="text-xs text-slate-300 mt-1 p-2 bg-surface-elevated border border-border rounded font-mono">
                  {item.excerpt || item.payload?.msg || `${item.payload?.name}=${item.payload?.value}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
