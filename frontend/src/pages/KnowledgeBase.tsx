import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, RefreshCw, CheckCircle, ShieldAlert } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export const KnowledgeBase: React.FC = () => {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);

  const { data: docs, isLoading } = useQuery({
    queryKey: ['knowledge-docs', search],
    queryFn: () => api.getKnowledgeDocs(search || undefined),
  });

  const ingestMutation = useMutation({
    mutationFn: () => api.ingestKnowledge(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-docs'] });
    },
  });

  const activeDoc = selectedDoc || (docs && docs.length > 0 ? docs[0] : null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">Runbook & Architecture Knowledge Base</h1>
          <p className="text-xs text-slate-400 font-mono">
            RAG index of standardized operating procedures, failure signatures, and architectural guidance.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => ingestMutation.mutate()}
            disabled={ingestMutation.isPending}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-600/40 rounded text-xs font-mono transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${ingestMutation.isPending ? 'animate-spin' : ''}`} />
            <span>{ingestMutation.isPending ? 'Chunking & Indexing...' : 'Re-index Runbooks Directory'}</span>
          </button>
        )}
      </div>

      {ingestMutation.isSuccess && (
        <div className="p-3 bg-emerald-950/50 border border-emerald-800 rounded text-xs font-mono text-emerald-300 flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Successfully indexed {ingestMutation.data.ingested_documents_count} documents into {ingestMutation.data.vector_backend}.
          </span>
        </div>
      )}

      {/* Untrusted Data Notice */}
      <div className="p-3 bg-slate-900 border border-border rounded text-[11px] font-mono text-slate-400 flex items-center space-x-2">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          Untrusted Data Boundary: Knowledge base text is ingested as passive reference evidence only. It can never override system prompts or trigger unauthorized tool calls.
        </span>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Semantic & keyword search across runbooks..."
          className="w-full pl-9 pr-4 py-2 bg-surface border border-border rounded text-xs font-mono text-slate-200 focus:outline-none focus:border-primary"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Document List */}
        <div className="bg-surface border border-border rounded-lg p-3 space-y-2">
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 px-2 py-1">
            Standard Runbooks ({docs?.length || 0})
          </h2>
          {isLoading ? (
            <div className="p-6 text-center text-slate-500 font-mono text-xs">Loading documents...</div>
          ) : (
            <div className="space-y-1">
              {(docs || []).map((doc: any) => (
                <button
                  key={doc.id || doc.filename}
                  onClick={() => setSelectedDoc(doc)}
                  className={`w-full p-2.5 rounded text-left border transition-colors flex flex-col space-y-1 ${
                    activeDoc?.filename === doc.filename
                      ? 'bg-primary/20 border-primary text-slate-100'
                      : 'bg-surface-elevated/60 border-border text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-mono text-xs font-semibold truncate">{doc.title || doc.filename}</div>
                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                    <span>{doc.filename}</span>
                    {doc.similarity_score !== undefined && (
                      <span className="text-blue-400 font-semibold">
                        Sim: {Math.round(doc.similarity_score * 100)}%
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Document Preview & Full Details */}
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4 lg:col-span-2">
          {activeDoc ? (
            <>
              <div className="border-b border-border pb-3">
                <h2 className="text-base font-bold font-mono text-slate-100">{activeDoc.title || activeDoc.filename}</h2>
                <div className="text-xs text-slate-400 font-mono flex items-center space-x-4 mt-1">
                  <span>File: <strong>{activeDoc.filename || activeDoc.document_filename}</strong></span>
                  {activeDoc.service && <span>Service: <strong className="text-blue-400">{activeDoc.service}</strong></span>}
                  {activeDoc.section && <span>Section: <strong className="text-slate-300">{activeDoc.section}</strong></span>}
                </div>
              </div>

              <div className="p-4 bg-surface-elevated border border-border rounded font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
                {activeDoc.full_content || activeDoc.excerpt || activeDoc.content || 'No content preview available.'}
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-slate-500 font-mono text-xs">
              Select a runbook from the left to view contents.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
