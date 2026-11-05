import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Plus,
  Zap,
  Search,
  X,
  ExternalLink,
} from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';

const SCENARIOS = [
  { id: 'db_pool', name: 'Database Connection Pool Exhaustion', service: 'checkout-service' },
  { id: 'bad_deploy', name: 'Faulty Deployment (OrderSerializer Error)', service: 'checkout-service' },
  { id: 'redis_latency', name: 'Redis Cache Slowdown & Timeouts', service: 'checkout-service' },
  { id: 'memory_leak', name: 'JVM / Container OOMKilled Memory Leak', service: 'inventory-service' },
  { id: 'payment_outage', name: 'Payment Gateway 503 Provider Outage', service: 'payment-service' },
  { id: 'queue_backlog', name: 'Kafka / RabbitMQ Consumer Lag Backlog', service: 'notification-service' },
  { id: 'cpu_saturation', name: 'API Gateway CPU Saturation & Throttling', service: 'api-gateway' },
  { id: 'network_timeout', name: 'Upstream ETIMEDOUT Socket Connection Failures', service: 'payment-service' },
];

export const IncidentExplorer: React.FC = () => {
  const queryClient = useQueryClient();
  const { canInvestigate } = useAuth();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');

  // Modals state
  const [syntheticModalOpen, setSyntheticModalOpen] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState('db_pool');
  const [seed, setSeed] = useState(0);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newService, setNewService] = useState('checkout-service');
  const [newSeverity, setNewSeverity] = useState('high');

  const { data, isLoading } = useQuery({
    queryKey: ['incidents-list', search, statusFilter, severityFilter, serviceFilter],
    queryFn: () =>
      api.getIncidents({
        search: search || undefined,
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
        service: serviceFilter || undefined,
      }),
  });

  const syntheticMutation = useMutation({
    mutationFn: () => api.createSyntheticIncident(selectedScenario, seed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents-list'] });
      queryClient.invalidateQueries({ queryKey: ['incidents-overview'] });
      setSyntheticModalOpen(false);
    },
  });

  const createMutation = useMutation({
    mutationFn: () => api.createIncident(newTitle, newService, newSeverity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents-list'] });
      queryClient.invalidateQueries({ queryKey: ['incidents-overview'] });
      setCreateModalOpen(false);
      setNewTitle('');
    },
  });

  const incidents = data?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">Incident Explorer</h1>
          <p className="text-xs text-slate-400 font-mono">Filter, inspect, and generate active system incidents</p>
        </div>

        {canInvestigate && (
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSyntheticModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-600/40 rounded text-xs font-mono transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Generate Synthetic Incident</span>
            </button>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-white rounded text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Incident</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface border border-border rounded-lg p-3 flex flex-wrap gap-3 items-center text-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search incident title..."
            className="w-full pl-8 pr-3 py-1.5 bg-surface-elevated border border-border rounded text-slate-200 focus:outline-none focus:border-primary font-mono text-xs"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-2.5 py-1.5 bg-surface-elevated border border-border rounded text-slate-300 focus:outline-none focus:border-primary font-mono"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="remediating">Remediating</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-2.5 py-1.5 bg-surface-elevated border border-border rounded text-slate-300 focus:outline-none focus:border-primary font-mono"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          className="px-2.5 py-1.5 bg-surface-elevated border border-border rounded text-slate-300 focus:outline-none focus:border-primary font-mono"
        >
          <option value="">All Services</option>
          <option value="checkout-service">checkout-service</option>
          <option value="payment-service">payment-service</option>
          <option value="inventory-service">inventory-service</option>
          <option value="notification-service">notification-service</option>
          <option value="api-gateway">api-gateway</option>
        </select>
      </div>

      {/* Incidents Table */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 font-mono text-xs">Loading incidents...</div>
        ) : incidents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-300">
              <thead className="bg-surface-elevated text-slate-400 font-mono uppercase text-[11px]">
                <tr>
                  <th className="p-3">Incident ID</th>
                  <th className="p-3">Title</th>
                  <th className="p-3">Service</th>
                  <th className="p-3">Severity</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Detected At</th>
                  <th className="p-3">Type</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {incidents.map((inc) => (
                  <tr key={inc.id} className="hover:bg-surface-elevated/50 transition-colors">
                    <td className="p-3 font-mono text-blue-400 font-semibold">{inc.id}</td>
                    <td className="p-3 font-medium text-slate-200">{inc.title}</td>
                    <td className="p-3 font-mono text-slate-300">{inc.service}</td>
                    <td className="p-3">
                      <StatusBadge type="severity" value={inc.severity} />
                    </td>
                    <td className="p-3">
                      <StatusBadge type="status" value={inc.status} />
                    </td>
                    <td className="p-3 font-mono text-slate-400">{new Date(inc.detected_at).toLocaleString()}</td>
                    <td className="p-3">
                      {inc.synthetic ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-950/60 text-amber-300 border border-amber-800">
                          Synthetic
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-slate-300 border border-slate-700">
                          Production
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Link
                        to={`/incidents/${inc.id}`}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 bg-surface-elevated hover:bg-slate-700 border border-border rounded text-[11px] font-mono text-slate-200 transition-colors"
                      >
                        <span>Workspace</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500 font-mono text-xs">
            No incidents found matching current filters.
          </div>
        )}
      </div>

      {/* Synthetic Incident Generator Modal */}
      {syntheticModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-border rounded-lg shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                <Zap className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
                  Generate Synthetic Scenario
                </h3>
              </div>
              <button
                onClick={() => setSyntheticModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-amber-300/90 bg-amber-950/40 p-2.5 rounded border border-amber-800 font-mono">
              Notice: All telemetry is synthetically generated from deterministic seeded templates. Ground truth remains isolated.
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div>
                <label className="block text-slate-300 mb-1">Scenario Template</label>
                <select
                  value={selectedScenario}
                  onChange={(e) => setSelectedScenario(e.target.value)}
                  className="w-full p-2 bg-surface-elevated border border-border rounded text-slate-200"
                >
                  {SCENARIOS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.service})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Deterministic Seed (0-10000)</label>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={seed}
                  onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                  className="w-full p-2 bg-surface-elevated border border-border rounded text-slate-200"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-border">
              <button
                onClick={() => setSyntheticModalOpen(false)}
                className="px-3 py-1.5 bg-surface-elevated hover:bg-slate-800 border border-border rounded text-xs font-mono text-slate-400"
              >
                Cancel
              </button>
              <button
                onClick={() => syntheticMutation.mutate()}
                disabled={syntheticMutation.isPending}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-mono font-semibold"
              >
                {syntheticMutation.isPending ? 'Generating...' : 'Inject Scenario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Incident Intake Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-border rounded-lg shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
                Declare Manual Incident
              </h3>
              <button onClick={() => setCreateModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div>
                <label className="block text-slate-300 mb-1">Incident Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Degraded latency on checkout"
                  className="w-full p-2 bg-surface-elevated border border-border rounded text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Affected Service</label>
                <select
                  value={newService}
                  onChange={(e) => setNewService(e.target.value)}
                  className="w-full p-2 bg-surface-elevated border border-border rounded text-slate-200"
                >
                  <option value="checkout-service">checkout-service</option>
                  <option value="payment-service">payment-service</option>
                  <option value="inventory-service">inventory-service</option>
                  <option value="notification-service">notification-service</option>
                  <option value="api-gateway">api-gateway</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Severity</label>
                <select
                  value={newSeverity}
                  onChange={(e) => setNewSeverity(e.target.value)}
                  className="w-full p-2 bg-surface-elevated border border-border rounded text-slate-200"
                >
                  <option value="critical">Critical (Tier-0)</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-border">
              <button
                onClick={() => setCreateModalOpen(false)}
                className="px-3 py-1.5 bg-surface-elevated hover:bg-slate-800 border border-border rounded text-xs font-mono text-slate-400"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !newTitle.trim()}
                className="px-3 py-1.5 bg-primary hover:bg-primary-hover text-white rounded text-xs font-mono font-semibold"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Incident'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
