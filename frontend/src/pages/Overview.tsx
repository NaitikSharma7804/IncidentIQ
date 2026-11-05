import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { api } from '../api/client';
import type { Incident, ServiceDetail } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';

export const Overview: React.FC = () => {
  const { data: incidentsData, isLoading: loadingIncidents, refetch: refetchIncidents } = useQuery({
    queryKey: ['incidents-overview'],
    queryFn: () => api.getIncidents({ limit: 100 }),
  });

  const { data: services, isLoading: loadingServices } = useQuery({
    queryKey: ['services-overview'],
    queryFn: () => api.getServices(),
  });

  const { data: investigations, isLoading: loadingInvestigations } = useQuery({
    queryKey: ['investigations-overview'],
    queryFn: () => api.getInvestigations(),
  });

  const incidents: Incident[] = incidentsData?.items || [];
  const totalIncidents = incidents.length;
  const criticalCount = incidents.filter((i) => i.severity === 'critical').length;
  const activeCount = incidents.filter((i) => i.status === 'open' || i.status === 'investigating' || i.status === 'remediating').length;

  // Compute MTTR from real resolved incidents
  const resolvedWithTimes = incidents.filter((i) => i.resolved_at && i.detected_at);
  let avgMTTRMinutes = 0;
  if (resolvedWithTimes.length > 0) {
    const totalDiffMs = resolvedWithTimes.reduce((acc, curr) => {
      const diff = new Date(curr.resolved_at!).getTime() - new Date(curr.detected_at).getTime();
      return acc + (diff > 0 ? diff : 0);
    }, 0);
    avgMTTRMinutes = Math.round(totalDiffMs / resolvedWithTimes.length / 60000);
  }

  // Compute Root Cause Identification Rate
  const totalInv = investigations?.length || 0;
  const identifiedInv = (investigations || []).filter((inv) => inv.status === 'completed' && inv.root_cause).length;
  const rcaRatePct = totalInv > 0 ? Math.round((identifiedInv / totalInv) * 100) : 0;

  // Severity Distribution for Recharts
  const severityCounts = {
    critical: incidents.filter((i) => i.severity === 'critical').length,
    high: incidents.filter((i) => i.severity === 'high').length,
    medium: incidents.filter((i) => i.severity === 'medium').length,
    low: incidents.filter((i) => i.severity === 'low').length,
  };

  const chartData = [
    { name: 'Critical', count: severityCounts.critical, color: '#ef4444' },
    { name: 'High', count: severityCounts.high, color: '#f97316' },
    { name: 'Medium', count: severityCounts.medium, color: '#f59e0b' },
    { name: 'Low', count: severityCounts.low, color: '#3b82f6' },
  ];

  const isLoading = loadingIncidents || loadingServices || loadingInvestigations;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">System Health & Incident Command</h1>
          <p className="text-xs text-slate-400 font-mono">Live operational telemetry & diagnostic status</p>
        </div>
        <button
          onClick={() => refetchIncidents()}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-surface-elevated hover:bg-slate-800 border border-border rounded text-xs font-mono text-slate-300 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Metric KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-lg p-4 space-y-1">
          <div className="flex justify-between items-center text-slate-400 text-xs font-mono">
            <span>Total Recorded Incidents</span>
            <AlertTriangle className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">{totalIncidents}</div>
          <div className="text-[11px] text-slate-400 font-mono">
            Active in Flight: <span className="text-amber-400 font-semibold">{activeCount}</span>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-4 space-y-1">
          <div className="flex justify-between items-center text-slate-400 text-xs font-mono">
            <span>Critical Severity</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-red-400">{criticalCount}</div>
          <div className="text-[11px] text-slate-400 font-mono">
            Requires dual commander approval
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-4 space-y-1">
          <div className="flex justify-between items-center text-slate-400 text-xs font-mono">
            <span>Mean Time to Resolution</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {resolvedWithTimes.length > 0 ? `${avgMTTRMinutes}m` : 'N/A'}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            {resolvedWithTimes.length} incidents resolved
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-4 space-y-1">
          <div className="flex justify-between items-center text-slate-400 text-xs font-mono">
            <span>RCA Identification Rate</span>
            <CheckCircle className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-purple-400">
            {totalInv > 0 ? `${rcaRatePct}%` : 'N/A'}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            {identifiedInv} / {totalInv} investigations completed
          </div>
        </div>
      </div>

      {/* Middle Section: Chart and Service Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Severity Distribution Chart */}
        <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Incident Severity Distribution</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111726', borderColor: '#232d42', fontSize: '12px' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Services Status Grid */}
        <div className="bg-surface border border-border rounded-lg p-4 space-y-3 lg:col-span-2">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold text-slate-200">Monitored Service Topology</h2>
            <Link to="/services" className="text-xs text-blue-400 hover:underline flex items-center space-x-1">
              <span>View Map</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(services || []).map((s: ServiceDetail) => (
              <div key={s.id} className="p-2.5 bg-surface-elevated/70 border border-border rounded flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-slate-200 truncate">{s.name}</span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      s.health_status === 'healthy'
                        ? 'bg-emerald-400'
                        : s.health_status === 'degraded'
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-red-500 animate-pulse'
                    }`}
                  />
                </div>
                <div className="flex justify-between items-center mt-2 text-[10px] text-slate-400 font-mono">
                  <span>{s.tier}</span>
                  <span className="capitalize">{s.health_status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Investigations */}
      <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-semibold text-slate-200">Recent Diagnostic Investigations</h2>
          <Link to="/incidents" className="text-xs text-blue-400 hover:underline flex items-center space-x-1">
            <span>Explore All Incidents</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {investigations && investigations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-300">
              <thead className="bg-surface-elevated text-slate-400 font-mono uppercase text-[11px]">
                <tr>
                  <th className="p-2.5">Investigation ID</th>
                  <th className="p-2.5">Incident</th>
                  <th className="p-2.5">Mode</th>
                  <th className="p-2.5">Diagnosis Root Cause</th>
                  <th className="p-2.5">Duration</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {investigations.slice(0, 5).map((inv) => (
                  <tr key={inv.id} className="hover:bg-surface-elevated/50 transition-colors">
                    <td className="p-2.5 font-mono text-slate-400">{inv.id.slice(0, 8)}...</td>
                    <td className="p-2.5 font-mono text-blue-400">{inv.incident_id}</td>
                    <td className="p-2.5 font-mono text-slate-300">{inv.mode}</td>
                    <td className="p-2.5 font-mono text-slate-200 font-semibold">{inv.root_cause || 'Inconclusive'}</td>
                    <td className="p-2.5 font-mono text-slate-400">{inv.duration_ms}ms</td>
                    <td className="p-2.5">
                      <StatusBadge type="status" value={inv.status} />
                    </td>
                    <td className="p-2.5 text-right">
                      <Link
                        to={`/incidents/${inv.incident_id}`}
                        className="px-2 py-1 bg-surface-elevated hover:bg-slate-700 border border-border rounded text-[11px] font-mono text-slate-300"
                      >
                        Inspect
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-slate-500 font-mono text-xs">
            No diagnostic investigations recorded yet. Generate or create an incident to trigger AI diagnosis.
          </div>
        )}
      </div>
    </div>
  );
};
