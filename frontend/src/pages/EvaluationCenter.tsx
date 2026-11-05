import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Info } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export const EvaluationCenter: React.FC = () => {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const [selectedRunId, setSelectedRunId] = useState<string>('');

  const { data: runs } = useQuery({
    queryKey: ['evaluation-runs'],
    queryFn: () => api.getEvaluationRuns(),
  });

  const activeRunId = selectedRunId || (runs && runs.length > 0 ? runs[0].id : '');

  const { data: runDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['evaluation-detail', activeRunId],
    queryFn: () => api.getEvaluationRun(activeRunId),
    enabled: !!activeRunId,
  });

  const evalMutation = useMutation({
    mutationFn: (allScenarios: boolean) => api.runEvaluation(allScenarios),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['evaluation-runs'] });
      if (data.run_id) {
        setSelectedRunId(data.run_id);
      }
    },
  });

  const agg = runDetail?.aggregate || (runs && runs.length > 0 ? runs[0].aggregate_metrics : null);
  const perScenario = runDetail?.per_scenario || [];

  const comparisonData = agg
    ? [
        {
          metric: 'Top-1 Accuracy',
          'Deterministic Rules': Math.round(agg.top1 * 100),
          'Naive Keyword Baseline': Math.round(agg.baseline_top1 * 100),
        },
        {
          metric: 'Top-k Recall',
          'Deterministic Rules': Math.round(agg.topk * 100),
          'Naive Keyword Baseline': Math.round(agg.baseline_top1 * 100),
        },
        {
          metric: 'Remediation Accuracy',
          'Deterministic Rules': Math.round((agg.remediation_accuracy || 0) * 100),
          'Naive Keyword Baseline': 0,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">Benchmark & Evaluation Center</h1>
          <p className="text-xs text-slate-400 font-mono">
            Scientific performance evaluation comparing deterministic diagnosis against naive keyword baseline.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center space-x-2">
            <button
              onClick={() => evalMutation.mutate(true)}
              disabled={evalMutation.isPending}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-mono font-semibold transition-colors"
            >
              <Play className={`w-3.5 h-3.5 ${evalMutation.isPending ? 'animate-spin' : ''}`} />
              <span>{evalMutation.isPending ? 'Executing Evaluation...' : 'Run Full Benchmark (8 Scenarios)'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Honest Benchmark Limitations Disclaimer */}
      <div className="p-4 bg-surface border border-border rounded-lg space-y-2 text-xs font-mono">
        <div className="flex items-center space-x-2 text-amber-400 font-bold uppercase tracking-wider text-[11px]">
          <Info className="w-4 h-4 shrink-0" />
          <span>Scientific Disclaimer & Dataset Limitations</span>
        </div>
        <p className="text-slate-400 leading-relaxed text-[11px]">
          All benchmark numbers are computed strictly post-hoc after predictions are finalized. Telemetry is synthetically generated with seeded random noise and decoy error bursts. High accuracy on synthetic templates demonstrates internal consistency and causal corroboration, but does not substitute for empirical real-world production incident validation.
        </p>
      </div>

      {/* Aggregate KPI Grid */}
      {agg && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
          <div className="p-3 bg-surface border border-border rounded space-y-1">
            <span className="text-[10px] text-slate-400 uppercase">Top-1 Accuracy</span>
            <div className="text-xl font-bold text-emerald-400">{Math.round(agg.top1 * 100)}%</div>
            <span className="text-[10px] text-slate-500">Root cause match</span>
          </div>

          <div className="p-3 bg-surface border border-border rounded space-y-1">
            <span className="text-[10px] text-slate-400 uppercase">Naive Baseline</span>
            <div className="text-xl font-bold text-amber-400">{Math.round(agg.baseline_top1 * 100)}%</div>
            <span className="text-[10px] text-slate-500">Regex keyword hits</span>
          </div>

          <div className="p-3 bg-surface border border-border rounded space-y-1">
            <span className="text-[10px] text-slate-400 uppercase">Ev. Precision</span>
            <div className="text-xl font-bold text-blue-400">
              {agg.evidence_precision !== null ? `${Math.round(agg.evidence_precision * 100)}%` : 'N/A'}
            </div>
            <span className="text-[10px] text-slate-500">Cited in required set</span>
          </div>

          <div className="p-3 bg-surface border border-border rounded space-y-1">
            <span className="text-[10px] text-slate-400 uppercase">Ev. Recall</span>
            <div className="text-xl font-bold text-purple-400">
              {agg.evidence_recall !== null ? `${Math.round(agg.evidence_recall * 100)}%` : 'N/A'}
            </div>
            <span className="text-[10px] text-slate-500">Required ev. cited</span>
          </div>

          <div className="p-3 bg-surface border border-border rounded space-y-1">
            <span className="text-[10px] text-slate-400 uppercase">Verification Success</span>
            <div className="text-xl font-bold text-emerald-400">
              {agg.verification_success !== null ? `${Math.round(agg.verification_success * 100)}%` : 'N/A'}
            </div>
            <span className="text-[10px] text-slate-500">Post-action recovery</span>
          </div>

          <div className="p-3 bg-surface border border-border rounded space-y-1">
            <span className="text-[10px] text-slate-400 uppercase">Mean Latency</span>
            <div className="text-xl font-bold text-slate-200">{agg.mean_latency_ms}ms</div>
            <span className="text-[10px] text-slate-500">Fast deterministic</span>
          </div>
        </div>
      )}

      {/* Comparison Chart */}
      {comparisonData.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-5 space-y-3">
          <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-200">
            Diagnosis Accuracy: Deterministic Rules vs Naive Baseline (%)
          </h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <XAxis dataKey="metric" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111726', borderColor: '#232d42', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="Deterministic Rules" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Naive Keyword Baseline" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per Scenario Details Table */}
      <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
        <div className="flex justify-between items-center text-xs font-mono">
          <h3 className="font-semibold text-slate-200 uppercase tracking-wider">
            Per-Scenario Seed Runs ({perScenario.length})
          </h3>
          <span className="text-slate-400">Run ID: {activeRunId || 'None'}</span>
        </div>

        {loadingDetail ? (
          <div className="p-8 text-center text-slate-400 font-mono text-xs">Loading run details...</div>
        ) : perScenario.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-300 font-mono">
              <thead className="bg-surface-elevated text-slate-400 uppercase text-[11px]">
                <tr>
                  <th className="p-2.5">Scenario</th>
                  <th className="p-2.5">Seed</th>
                  <th className="p-2.5">Top-1 Rule</th>
                  <th className="p-2.5">Top-1 Baseline</th>
                  <th className="p-2.5">Ev. Precision</th>
                  <th className="p-2.5">Ev. Recall</th>
                  <th className="p-2.5">Action OK</th>
                  <th className="p-2.5">Verified</th>
                  <th className="p-2.5 text-right">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {perScenario.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-surface-elevated/50">
                    <td className="p-2.5 font-bold text-slate-200">{row.scenario}</td>
                    <td className="p-2.5 text-slate-400">{row.seed}</td>
                    <td className="p-2.5">
                      <span className={row.top1 ? 'text-emerald-400 font-bold' : 'text-red-400'}>
                        {row.top1 ? 'PASS' : 'FAIL'}
                      </span>
                    </td>
                    <td className="p-2.5">
                      <span className={row.baseline_top1 ? 'text-emerald-400' : 'text-amber-400 font-bold'}>
                        {row.baseline_top1 ? 'PASS' : 'FAIL (Fooled by Decoy)'}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-300">
                      {row.ev_precision !== null ? `${Math.round(row.ev_precision * 100)}%` : '-'}
                    </td>
                    <td className="p-2.5 text-slate-300">
                      {row.ev_recall !== null ? `${Math.round(row.ev_recall * 100)}%` : '-'}
                    </td>
                    <td className="p-2.5 text-slate-300">{row.action_ok ? 'YES' : 'NO'}</td>
                    <td className="p-2.5">
                      <span className={row.verified ? 'text-emerald-400' : 'text-red-400'}>
                        {row.verified ? 'RECOVERED' : 'UNRECOVERED'}
                      </span>
                    </td>
                    <td className="p-2.5 text-right text-slate-400">{row.latency_ms}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500 font-mono text-xs">
            No evaluation runs recorded. Run an evaluation using the button above.
          </div>
        )}
      </div>
    </div>
  );
};
