import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layers, ArrowRight, Server } from 'lucide-react';
import { api } from '../api/client';

export const ServiceMap: React.FC = () => {
  const [selectedService, setSelectedService] = useState<string>('checkout-service');

  const { data: services } = useQuery({
    queryKey: ['services-map'],
    queryFn: () => api.getServices(),
  });

  const activeService = (services || []).find((s) => s.name === selectedService) || (services ? services[0] : null);

  // Find upstream callers (services that depend on this service)
  const upstreamCallers = (services || []).filter((s) => s.dependencies && s.dependencies.includes(selectedService));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100 tracking-tight">Microservice Topology & Dependencies</h1>
        <p className="text-xs text-slate-400 font-mono">
          Interactive dependency graph and real-time health telemetry across all monitored microservices.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Service Nodes List */}
        <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
          <h2 className="text-xs font-mono font-semibold text-slate-300 uppercase tracking-wider">
            All Monitored Services ({services?.length || 0})
          </h2>
          <div className="space-y-2">
            {(services || []).map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedService(s.name)}
                className={`w-full p-3 rounded text-left border transition-all flex items-center justify-between ${
                  selectedService === s.name
                    ? 'bg-primary/20 border-primary text-slate-100'
                    : 'bg-surface-elevated/70 border-border text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="font-mono text-xs font-bold">{s.name}</div>
                  <div className="text-[11px] text-slate-400 font-mono">{s.tier}</div>
                </div>
                <div className="flex items-center space-x-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      s.health_status === 'healthy'
                        ? 'bg-emerald-400'
                        : s.health_status === 'degraded'
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-red-400 animate-pulse'
                    }`}
                  />
                  <span className="text-[11px] font-mono capitalize">{s.health_status}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Selected Service Topology & Deep Dive */}
        <div className="bg-surface border border-border rounded-lg p-6 space-y-6 lg:col-span-2">
          {activeService ? (
            <>
              <div className="flex justify-between items-start border-b border-border pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <Server className="w-5 h-5 text-blue-400" />
                    <h2 className="text-lg font-bold font-mono text-slate-100">{activeService.name}</h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-slate-300 border border-slate-700">
                      {activeService.tier}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{activeService.description}</p>
                </div>
                <div className="flex items-center space-x-1.5 px-3 py-1 bg-surface-elevated rounded border border-border text-xs font-mono">
                  <span className="text-slate-400">Health:</span>
                  <span
                    className={`font-semibold capitalize ${
                      activeService.health_status === 'healthy' ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {activeService.health_status}
                  </span>
                </div>
              </div>

              {/* Topology Relationships */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Downstream Dependencies */}
                <div className="p-4 bg-surface-elevated border border-border rounded space-y-3">
                  <div className="flex items-center space-x-2 text-xs font-mono font-semibold uppercase text-slate-300">
                    <ArrowRight className="w-4 h-4 text-blue-400" />
                    <span>Downstream Dependencies (Outgoing)</span>
                  </div>
                  {activeService.dependencies && activeService.dependencies.length > 0 ? (
                    <div className="space-y-2">
                      {activeService.dependencies.map((depName) => (
                        <div
                          key={depName}
                          onClick={() => setSelectedService(depName)}
                          className="p-2.5 bg-slate-900 border border-slate-800 rounded font-mono text-xs flex justify-between items-center cursor-pointer hover:border-slate-600 transition-colors"
                        >
                          <span className="text-slate-200">{depName}</span>
                          <span className="text-[10px] text-blue-400">View Node</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs font-mono text-slate-500 italic p-3">
                      Leaf node: no downstream service dependencies.
                    </div>
                  )}
                </div>

                {/* Upstream Callers */}
                <div className="p-4 bg-surface-elevated border border-border rounded space-y-3">
                  <div className="flex items-center space-x-2 text-xs font-mono font-semibold uppercase text-slate-300">
                    <Layers className="w-4 h-4 text-purple-400" />
                    <span>Upstream Callers (Incoming)</span>
                  </div>
                  {upstreamCallers.length > 0 ? (
                    <div className="space-y-2">
                      {upstreamCallers.map((up) => (
                        <div
                          key={up.id}
                          onClick={() => setSelectedService(up.name)}
                          className="p-2.5 bg-slate-900 border border-slate-800 rounded font-mono text-xs flex justify-between items-center cursor-pointer hover:border-slate-600 transition-colors"
                        >
                          <span className="text-slate-200">{up.name}</span>
                          <span className="text-[10px] text-purple-400">View Node</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs font-mono text-slate-500 italic p-3">
                      Ingress edge: no upstream internal microservice dependencies.
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-slate-500 font-mono text-xs">Select a service to view topology.</div>
          )}
        </div>
      </div>
    </div>
  );
};
