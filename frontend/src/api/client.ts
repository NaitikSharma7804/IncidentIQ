/**
 * Typed API client for IncidentIQ.
 * Connects directly to FastAPI backend with bearer token authentication.
 */

const API_BASE = '/api/v1';

export interface UserProfile {
  id: string;
  username: string;
  sub: string;
  role: 'viewer' | 'engineer' | 'incident_commander' | 'admin';
  active: boolean;
}

export interface Incident {
  id: string;
  title: string;
  service: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'remediating' | 'resolved' | 'closed';
  detected_at: string;
  resolved_at?: string | null;
  synthetic: boolean;
}

export interface TelemetryRecord {
  id: string;
  source_type: 'log' | 'metric' | 'deployment';
  service: string;
  timestamp: string;
  payload: Record<string, any>;
}

export interface Hypothesis {
  id: string;
  rank: number;
  category: string;
  confidence: number;
  status: 'candidate' | 'rejected' | 'accepted';
  supporting_evidence: string[];
  contradicting_evidence: string[];
  missing_evidence: string[];
  explanation: string;
}

export interface EvidenceItem {
  id: string;
  source_type: string;
  source_record_id?: string;
  service?: string;
  timestamp?: string;
  excerpt: string;
  count?: number;
  document_title?: string;
  similarity_score?: number;
}

export interface RemediationProposal {
  id: string;
  action: string;
  service: string;
  params: Record<string, any>;
  risk: 'low' | 'medium' | 'high';
  requester: string;
  approval: 'not_required' | 'pending' | 'approved' | 'rejected';
  approver?: string | null;
  status: 'proposed' | 'executed' | 'rejected' | 'failed';
  verification?: string | null;
  simulated: boolean;
}

export interface InvestigationReport {
  id?: string;
  incident_id?: string;
  status: 'completed' | 'inconclusive' | 'failed' | 'running';
  mode: string;
  confidence_kind: string;
  synthetic: boolean;
  root_cause?: string | null;
  reason?: string | null;
  duration_ms: number;
  stages: Array<{ name: string; status: string; ms: number; error?: string }>;
  hypotheses: Hypothesis[];
  evidence: EvidenceItem[];
  knowledge_sources?: EvidenceItem[];
  remediation?: {
    action: string;
    service: string;
    params: Record<string, any>;
    risk: string;
  } | null;
  remediation_proposal?: RemediationProposal | null;
  timeline?: Array<{ timestamp: string; evidence_id: string; excerpt: string }>;
  unsupported_claims_count?: number;
}

export interface ServiceDetail {
  id: string;
  name: string;
  description: string;
  tier: string;
  dependencies: string[];
  health_status: 'healthy' | 'degraded' | 'critical';
}

export interface ServiceTopology {
  nodes: Array<{ id: string; label: string; tier: string; health: string }>;
  edges: Array<{ source: string; target: string }>;
}

export interface EvaluationRun {
  id: string;
  dataset_name: string;
  mode: string;
  started_at: string;
  completed_at: string;
  aggregate_metrics: {
    n: number;
    top1: number;
    topk: number;
    baseline_top1: number;
    evidence_precision: number | null;
    evidence_recall: number | null;
    unsupported_claim_rate: number;
    remediation_accuracy: number | null;
    verification_success: number | null;
    inconclusive_rate: number;
    failure_rate: number;
    mean_latency_ms: number;
  };
}

export interface SystemInfo {
  environment: string;
  vector_backend: string;
  llm_enabled: boolean;
  llm_model: string;
  database: { status: string; backend: string; reachable: boolean };
  server_time: string;
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  outcome: string;
  resource_id?: string | null;
  details?: Record<string, any>;
  timestamp: string;
}

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('incidentiq_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `Request failed with status ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data.detail === 'string') {
        errorDetail = data.detail;
      } else if (data.detail && typeof data.detail === 'object') {
        errorDetail = JSON.stringify(data.detail);
      }
    } catch {
      // response wasn't json
    }
    throw new Error(errorDetail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  async login(username: string, password: string):Promise<{ access_token: string; role: string; username: string }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return handleResponse(res);
  },

  async getMe(): Promise<UserProfile> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  // Incidents
  async getIncidents(params?: { status?: string; severity?: string; service?: string; search?: string; limit?: number; offset?: number }): Promise<{ total: number; items: Incident[] }> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.severity) query.set('severity', params.severity);
    if (params?.service) query.set('service', params.service);
    if (params?.search) query.set('search', params.search);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.offset !== undefined) query.set('offset', String(params.offset));

    const res = await fetch(`${API_BASE}/incidents?${query.toString()}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  async getIncident(id: string): Promise<Incident> {
    const res = await fetch(`${API_BASE}/incidents/${id}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  async createSyntheticIncident(scenario: string, seed: number = 0): Promise<Incident> {
    const res = await fetch(`${API_BASE}/incidents/synthetic`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ scenario, seed }),
    });
    return handleResponse(res);
  },

  async createIncident(title: string, service: string, severity: string): Promise<Incident> {
    const res = await fetch(`${API_BASE}/incidents`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ title, service, severity }),
    });
    return handleResponse(res);
  },

  async patchIncident(id: string, updates: { status?: string; severity?: string }): Promise<Incident> {
    const res = await fetch(`${API_BASE}/incidents/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    return handleResponse(res);
  },

  async getIncidentTelemetry(id: string, sourceType?: string): Promise<TelemetryRecord[]> {
    const query = sourceType ? `?source_type=${sourceType}` : '';
    const res = await fetch(`${API_BASE}/incidents/${id}/telemetry${query}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  // Investigations
  async investigateIncident(id: string, mode: string = 'deterministic_rules'): Promise<InvestigationReport> {
    const res = await fetch(`${API_BASE}/incidents/${id}/investigate`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ mode }),
    });
    return handleResponse(res);
  },

  async getInvestigations(incidentId?: string): Promise<Array<{ id: string; incident_id: string; status: string; mode: string; root_cause: string; duration_ms: number; started_at: string }>> {
    const query = incidentId ? `?incident_id=${incidentId}` : '';
    const res = await fetch(`${API_BASE}/investigations${query}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  async getInvestigation(id: string): Promise<InvestigationReport> {
    const res = await fetch(`${API_BASE}/investigations/${id}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  // Remediations
  async getRemediations(incidentId: string): Promise<RemediationProposal[]> {
    const res = await fetch(`${API_BASE}/incidents/${incidentId}/remediations`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  async approveRemediation(incidentId: string, actionId: string): Promise<RemediationProposal> {
    const res = await fetch(`${API_BASE}/incidents/${incidentId}/remediations/${actionId}/approve`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  async rejectRemediation(incidentId: string, actionId: string, reason?: string): Promise<RemediationProposal> {
    const res = await fetch(`${API_BASE}/incidents/${incidentId}/remediations/${actionId}/reject`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason }),
    });
    return handleResponse(res);
  },

  async executeRemediation(incidentId: string, actionId: string): Promise<RemediationProposal> {
    const res = await fetch(`${API_BASE}/incidents/${incidentId}/remediations/${actionId}/execute`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  async verifyRemediation(incidentId: string, actionId: string): Promise<{ id: string; status: string; verification: string }> {
    const res = await fetch(`${API_BASE}/incidents/${incidentId}/remediations/${actionId}/verify`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  // Services
  async getServices(): Promise<ServiceDetail[]> {
    const res = await fetch(`${API_BASE}/services`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  async getServiceTopology(): Promise<ServiceTopology> {
    const res = await fetch(`${API_BASE}/services/map/graph`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  // Knowledge
  async getKnowledgeDocs(query?: string): Promise<Array<any>> {
    const q = query ? `?query=${encodeURIComponent(query)}` : '';
    const res = await fetch(`${API_BASE}/knowledge${q}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  async ingestKnowledge(): Promise<{ ingested_documents_count: number; vector_backend: string }> {
    const res = await fetch(`${API_BASE}/knowledge/ingest`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  // Evaluations
  async runEvaluation(allScenarios: boolean = true): Promise<any> {
    const res = await fetch(`${API_BASE}/evaluations/run?all_scenarios=${allScenarios}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  async getEvaluationRuns(): Promise<EvaluationRun[]> {
    const res = await fetch(`${API_BASE}/evaluations`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  async getEvaluationRun(id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/evaluations/${id}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  // System
  async getSystemInfo(): Promise<SystemInfo> {
    const res = await fetch(`${API_BASE}/system/info`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  async getReady(): Promise<any> {
    const res = await fetch('/ready');
    return handleResponse(res);
  },

  async getAuditEvents(): Promise<AuditEvent[]> {
    const res = await fetch(`${API_BASE}/audit`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },
};
