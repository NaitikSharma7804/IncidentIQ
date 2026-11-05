import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Database, BookOpen } from 'lucide-react';
import { api } from '../api/client';

export const EvidenceExplorer: React.FC = () => {
  const [sourceType, setSourceType] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>('');

  const { data: incidentsData } = useQuery({
    queryKey: ['incidents-for-evidence'],
    queryFn: () => api.getIncidents({ limit: 50 }),
  });

  const incidents = incidentsData?.items || [];
  const activeIncidentId = selectedIncidentId || (incidents.length > 0 ? incidents[0].id : '');

  const { data: telemetry, isLoading: loadingTelemetry } = useQuery({
    queryKey: ['telemetry-evidence', activeIncidentId],
    queryFn: () => api.getIncidentTelemetry(activeIncidentId),
    enabled: !!activeIncidentId,
  });

  const { data: knowledgeDocs } = useQuery({
    queryKey: ['knowledge-evidence', search],
    queryFn: () => api.getKnowledgeDocs(search || undefined),
  });

  // Filter telemetry records
  const filteredTelemetry = (telemetry || []).filter((r) => {
    if (sourceType !== 'all' && r.source_type !== sourceType) return false;
    if (search) {
      const s = search.toLowerCase();
      const content = JSON.stringify(r.payload).toLowerCase();
      return r.id.toLowerCase().includes(s) || content.includes(s) || r.service.toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100 tracking-tight">Evidence Explorer</h1>
        <p className="text-xs text-slate-400 font-mono">
          Unified audit index of real observable evidence: logs, metrics, deployments, and untrusted knowledge sources.
        </p>
      </div>

      {/* Control bar */}
      <div className="bg-surface border border-border rounded-lg p-3 flex flex-wrap gap-3 items-center text-xs font-mono">
        <div className="flex items-center space-x-2">
          <label className="text-slate-400">Incident:</label>
          <select
            value={activeIncidentId}
            onChange={(e) => setSelectedIncidentId(e.target.value)}
            className="px-2.5 py-1.5 bg-surface-elevated border border-border rounded text-slate-200"
          >
            {incidents.map((inc) => (
              <option key={inc.id} value={inc.id}>
                {inc.id} - {inc.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <label className="text-slate-400">Source Type:</label>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            className="px-2.5 py-1.5 bg-surface-elevated border border-border rounded text-slate-200"
          >
            <option value="all">All Sources</option>
            <option value="log">Application Logs</option>
            <option value="metric">Time-Series Metrics</option>
            <option value="deployment">Deployments</option>
          </select>
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search excerpt, service or ID..."
            className="w-full pl-8 pr-3 py-1.5 bg-surface-elevated border border-border rounded text-slate-200 focus:outline-none focus:border-primary text-xs font-mono"
          />
        </div>
      </div>

      {/* Telemetry Evidence Section */}
      <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
        <div className="flex justify-between items-center text-xs font-mono">
          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4 text-blue-400" />
            <h3 className="font-semibold text-slate-200 uppercase tracking-wider">
              Telemetry Evidence Records ({filteredTelemetry.length})
            </h3>
          </div>
          <span className="text-slate-400">Incident: {activeIncidentId}</span>
        </div>

        {loadingTelemetry ? (
          <div className="p-8 text-center text-slate-400 font-mono text-xs">Loading evidence...</div>
        ) : filteredTelemetry.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-300 font-mono">
              <thead className="bg-surface-elevated text-slate-400 uppercase text-[11px]">
                <tr>
                  <th className="p-2.5">Stable Evidence ID</th>
                  <th className="p-2.5">Source Type</th>
                  <th className="p-2.5">Service</th>
                  <th className="p-2.5">Timestamp</th>
                  <th className="p-2.5">Observation Excerpt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredTelemetry.map((rec) => (
                  <tr key={rec.id} className="hover:bg-surface-elevated/50">
                    <td className="p-2.5 text-blue-400 font-semibold">ev:{rec.id}</td>
                    <td className="p-2.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        {rec.source_type}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-300">{rec.service}</td>
                    <td className="p-2.5 text-slate-400">{rec.timestamp}</td>
                    <td className="p-2.5 text-slate-200 max-w-lg truncate">
                      {rec.source_type === 'log'
                        ? rec.payload.msg
                        : rec.source_type === 'metric'
                        ? `${rec.payload.name} = ${rec.payload.value}`
                        : `Changes: ${rec.payload.changes?.join('; ')}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500 font-mono text-xs">
            No telemetry records match current filters.
          </div>
        )}
      </div>

      {/* Retrieved Knowledge Documentation Section */}
      <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center space-x-2 text-xs font-mono">
          <BookOpen className="w-4 h-4 text-emerald-400" />
          <h3 className="font-semibold text-slate-200 uppercase tracking-wider">
            Untrusted Runbook & Knowledge Documents
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(knowledgeDocs || []).map((doc: any, i: number) => (
            <div key={i} className="p-3 bg-surface-elevated border border-border rounded text-xs space-y-1.5 font-mono">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-200 truncate">{doc.title || doc.filename}</span>
                <span className="text-[10px] uppercase text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800">
                  {doc.doc_type || 'runbook'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-2">
                {doc.excerpt || `Service: ${doc.service || 'Platform-wide microservices'}`}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
