import React from 'react';

interface StatusBadgeProps {
  type: 'status' | 'severity' | 'risk' | 'approval' | 'verification' | 'mode';
  value: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ type, value }) => {
  const val = (value || '').toLowerCase();

  let colorClasses = 'bg-slate-800 text-slate-300 border-slate-700';

  if (type === 'severity') {
    if (val === 'critical') colorClasses = 'bg-red-950/80 text-red-300 border-red-800 font-semibold';
    else if (val === 'high') colorClasses = 'bg-orange-950/80 text-orange-300 border-orange-800';
    else if (val === 'medium') colorClasses = 'bg-yellow-950/80 text-yellow-300 border-yellow-800';
    else if (val === 'low') colorClasses = 'bg-blue-950/80 text-blue-300 border-blue-800';
  } else if (type === 'status') {
    if (val === 'open') colorClasses = 'bg-red-950/70 text-red-300 border-red-800';
    else if (val === 'investigating') colorClasses = 'bg-blue-950/70 text-blue-300 border-blue-800 animate-pulse';
    else if (val === 'remediating') colorClasses = 'bg-amber-950/70 text-amber-300 border-amber-800';
    else if (val === 'resolved') colorClasses = 'bg-emerald-950/70 text-emerald-300 border-emerald-800';
    else if (val === 'closed') colorClasses = 'bg-slate-900 text-slate-400 border-slate-800';
    else if (val === 'completed') colorClasses = 'bg-emerald-950/70 text-emerald-300 border-emerald-800';
    else if (val === 'inconclusive') colorClasses = 'bg-purple-950/70 text-purple-300 border-purple-800';
    else if (val === 'failed') colorClasses = 'bg-rose-950/70 text-rose-300 border-rose-800';
  } else if (type === 'risk') {
    if (val === 'high') colorClasses = 'bg-red-900/40 text-red-300 border-red-700';
    else if (val === 'medium') colorClasses = 'bg-amber-900/40 text-amber-300 border-amber-700';
    else colorClasses = 'bg-emerald-900/40 text-emerald-300 border-emerald-700';
  } else if (type === 'approval') {
    if (val === 'approved') colorClasses = 'bg-emerald-950 text-emerald-300 border-emerald-700';
    else if (val === 'pending') colorClasses = 'bg-amber-950 text-amber-300 border-amber-700';
    else if (val === 'rejected') colorClasses = 'bg-rose-950 text-rose-300 border-rose-700';
    else colorClasses = 'bg-slate-800 text-slate-400 border-slate-700';
  } else if (type === 'verification') {
    if (val === 'recovered') colorClasses = 'bg-emerald-950 text-emerald-300 border-emerald-600';
    else if (val === 'not_recovered') colorClasses = 'bg-red-950 text-red-300 border-red-700';
    else colorClasses = 'bg-slate-800 text-slate-400 border-slate-700';
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border uppercase tracking-wider ${colorClasses}`}>
      {value}
    </span>
  );
};

