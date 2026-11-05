"""LangGraph agent workflow for IncidentIQ investigations.
Supports deterministic, retrieval-assisted, and optional LLM-assisted execution.
Maintains strict ground-truth isolation.
"""
import json
import time
from typing import Any, TypedDict

import httpx
from langgraph.graph import END, StateGraph
from pydantic import BaseModel, Field

from . import diagnosis as D
from . import remediation as R
from .config import get_settings
from .database import SessionLocal
from .knowledge import search_knowledge

settings = get_settings()


class InvestigationState(TypedDict, total=False):
    incident_id: str
    incident_service: str
    observables: dict[str, Any]
    config: dict[str, Any]
    mode: str  # deterministic_rules, retrieval_assisted, llm_assisted
    stages: list[dict[str, Any]]
    evidence: list[dict[str, Any]]
    knowledge_evidence: list[dict[str, Any]]
    hypotheses: list[dict[str, Any]]
    ranked_hypotheses: list[dict[str, Any]]
    selected_remediation: dict[str, Any] | None
    remediation_proposal: dict[str, Any] | None
    remediation_status: str | None
    verification_status: str | None
    status: str  # completed, inconclusive, failed, waiting_approval
    root_cause: str | None
    reason: str | None
    unsupported_claims_count: int
    duration_ms: float
    report: dict[str, Any]
    llm_prompts_captured: list[str]
    simulator: Any | None  # simulator instance for simulated verification if attached


# Pydantic schema for structured LLM response validation
class LLMHypothesisItem(BaseModel):
    category: str
    confidence: float = Field(ge=0.0, le=1.0)
    supporting_evidence: list[str] = Field(default_factory=list)
    explanation: str = Field(default="")


class LLMDiagnosisResponse(BaseModel):
    hypotheses: list[LLMHypothesisItem]


def _record_stage(state: InvestigationState, name: str, status: str, duration_ms: float, error: str | None = None):
    stages = state.setdefault("stages", [])
    entry = {"name": name, "status": status, "ms": duration_ms}
    if error:
        entry["error"] = error
    stages.append(entry)


# 1. Intake and Validation Node
def intake_node(state: InvestigationState) -> dict[str, Any]:
    t0 = time.perf_counter()
    obs = state.get("observables") or {}
    incident = obs.get("incident") or {}
    service = incident.get("service")
    if not service:
        _record_stage(state, "intake", "failed", round((time.perf_counter() - t0) * 1e3, 2), "missing_service")
        return {"status": "failed", "reason": "missing service in incident metadata"}

    _record_stage(state, "intake", "ok", round((time.perf_counter() - t0) * 1e3, 2))
    return {"incident_service": service, "unsupported_claims_count": 0, "llm_prompts_captured": []}


# 2. Telemetry Collection Node
def telemetry_node(state: InvestigationState) -> dict[str, Any]:
    t0 = time.perf_counter()
    obs = state["observables"]
    cfg = state.get("config") or D.DEFAULT_CONFIG
    evidence, skipped = D.collect(obs, cfg)
    ms = round((time.perf_counter() - t0) * 1e3, 2)
    _record_stage(state, "telemetry_collection", "ok", ms)
    return {"evidence": evidence, "skipped_records": skipped}


# 3. Knowledge Retrieval Node
def knowledge_retrieval_node(state: InvestigationState) -> dict[str, Any]:
    t0 = time.perf_counter()
    mode = state.get("mode", "deterministic_rules")
    if mode in ("deterministic_rules",):
        _record_stage(state, "knowledge_retrieval", "skipped", 0.0)
        return {"knowledge_evidence": []}

    svc = state.get("incident_service")
    evidence = state.get("evidence", [])
    symptom_text = " ".join([e.get("excerpt", "") for e in evidence[:5]])

    db = SessionLocal()
    try:
        k_results = search_knowledge(db, query=f"{svc} {symptom_text}", top_k=3)
        ms = round((time.perf_counter() - t0) * 1e3, 2)
        _record_stage(state, "knowledge_retrieval", "ok", ms)

        # Merge knowledge evidence with general evidence
        all_ev = list(state.get("evidence", []))
        for item in k_results:
            all_ev.append(item)
        return {"knowledge_evidence": k_results, "evidence": all_ev}
    except Exception as exc:
        ms = round((time.perf_counter() - t0) * 1e3, 2)
        _record_stage(state, "knowledge_retrieval", "failed", ms, str(exc))
        return {"knowledge_evidence": []}
    finally:
        db.close()


# 4. Hypothesis Generation Node
def hypothesis_generation_node(state: InvestigationState) -> dict[str, Any]:
    t0 = time.perf_counter()
    mode = state.get("mode", "deterministic_rules")
    evidence = state.get("evidence", [])
    incident_service = state.get("incident_service", "")
    valid_ids = {e["id"] for e in evidence}
    prompts_captured = list(state.get("llm_prompts_captured", []))
    unsupported = state.get("unsupported_claims_count", 0)

    # Deterministic generation
    hyps = [D.score(c, evidence, incident_service) for c in D.SIGS]

    # Optional LLM-assisted hypothesis generation
    curr_settings = get_settings()
    if mode == "llm_assisted" and curr_settings.incidentiq_enable_llm:
        # Construct strict context with evidence IDs only; NO ground truth anywhere
        telemetry_summary = [
            {"id": e["id"], "type": e["source_type"], "service": e.get("service"), "excerpt": e["excerpt"]}
            for e in evidence[:15]
        ]
        prompt = (
            f"Analyze incident telemetry for service '{incident_service}'.\n"
            f"Candidate causes: {list(D.SIGS.keys())}.\n"
            f"Telemetry observations: {json.dumps(telemetry_summary)}.\n"
            "Return JSON matching schema: {'hypotheses': [{'category': str, 'confidence': float, 'supporting_evidence': [str], 'explanation': str}]}"
        )
        prompts_captured.append(prompt)

        try:
            url = (curr_settings.incidentiq_llm_base_url or "https://api.openai.com/v1").rstrip("/") + "/chat/completions"
            headers = {"Authorization": f"Bearer {curr_settings.incidentiq_llm_api_key or 'test'}", "Content-Type": "application/json"}
            payload = {
                "model": curr_settings.incidentiq_llm_model,
                "messages": [{"role": "system", "content": "You are an SRE incident analyst."}, {"role": "user", "content": prompt}],
                "temperature": 0.0,
            }
            # Fast timeout to ensure deterministic fallback if unconfigured
            with httpx.Client(timeout=2.0) as client:
                res = client.post(url, json=payload, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    content = data["choices"][0]["message"]["content"]
                    parsed = LLMDiagnosisResponse.model_validate_json(content)
                    llm_hyps = []
                    for h in parsed.hypotheses:
                        if h.category in D.SIGS:
                            # Strict evidence ID validation: drop unknown IDs
                            verified_ids = []
                            for eid in h.supporting_evidence:
                                if eid in valid_ids:
                                    verified_ids.append(eid)
                                else:
                                    unsupported += 1
                            llm_hyps.append(
                                dict(
                                    category=h.category,
                                    confidence=h.confidence,
                                    supporting_evidence=verified_ids,
                                    contradicting_evidence=[],
                                    missing_evidence=[],
                                    explanation=f"[LLM-Assisted] {h.explanation}",
                                )
                            )
                    if llm_hyps:
                        hyps = llm_hyps
        except Exception:
            # Deterministic fallback seamlessly used upon error or timeout
            pass

    ms = round((time.perf_counter() - t0) * 1e3, 2)
    _record_stage(state, "hypothesis_generation", "ok", ms)
    return {
        "hypotheses": hyps,
        "llm_prompts_captured": prompts_captured,
        "unsupported_claims_count": unsupported,
    }


# 5. Hypothesis Ranking & Verification Node
def hypothesis_ranking_node(state: InvestigationState) -> dict[str, Any]:
    t0 = time.perf_counter()
    hyps = state.get("hypotheses", [])
    cfg = state.get("config") or D.DEFAULT_CONFIG

    sorted_hyps = sorted(hyps, key=lambda h: (-h["confidence"], h["category"]))
    for i, h in enumerate(sorted_hyps):
        h.update(id=f"hyp-{i+1}", rank=i + 1, status="rejected" if h["confidence"] < 0.25 else "candidate")

    ms = round((time.perf_counter() - t0) * 1e3, 2)
    _record_stage(state, "hypothesis_ranking", "ok", ms)

    if not sorted_hyps:
        return {"ranked_hypotheses": [], "status": "inconclusive", "reason": "no hypotheses generated"}

    top = sorted_hyps[0]
    gap = sorted_hyps[0]["confidence"] - (sorted_hyps[1]["confidence"] if len(sorted_hyps) > 1 else 0.0)

    # Focused verification on tight race
    if gap < cfg.get("min_gap", 0.1) and len(sorted_hyps) > 1:
        if len(sorted_hyps[0]["supporting_evidence"]) > len(sorted_hyps[1]["supporting_evidence"]):
            gap = 0.15

    if top["confidence"] < cfg.get("min_confidence", 0.5) or gap < cfg.get("min_gap", 0.1):
        return {
            "ranked_hypotheses": sorted_hyps,
            "status": "inconclusive",
            "reason": "top hypothesis lacks sufficient or distinguishing support",
        }

    return {"ranked_hypotheses": sorted_hyps, "root_cause": top["category"], "status": "investigated"}


# 6. Remediation Planning Node
def remediation_planning_node(state: InvestigationState) -> dict[str, Any]:
    t0 = time.perf_counter()
    root_cause = state.get("root_cause")
    svc = state.get("incident_service")
    evidence = state.get("evidence", [])

    if not root_cause or root_cause not in D.PLAYBOOK:
        _record_stage(state, "remediation_planning", "skipped", 0.0)
        return {"selected_remediation": None}

    act, params = D.PLAYBOOK[root_cause]
    if act == "rollback_deployment":
        d = [e for e in evidence if e.get("source_type") == "deployment" and e.get("service") == svc]
        params = {"deployment_id": d[-1]["source_record_id"]} if d else params

    risk, _ = R.ACTIONS[act]
    ms = round((time.perf_counter() - t0) * 1e3, 2)
    _record_stage(state, "remediation_planning", "ok", ms)

    remediation = dict(
        action=act,
        service=svc,
        params=params,
        risk=risk,
        approval_status="not_required" if risk == "low" else "pending",
    )
    return {"selected_remediation": remediation}


# 7. Final Report Node
def final_report_node(state: InvestigationState) -> dict[str, Any]:
    t0 = time.perf_counter()
    status = state.get("status", "completed")
    if status == "investigated":
        status = "completed"

    evidence = state.get("evidence", [])
    timeline = [
        dict(timestamp=e["timestamp"], evidence_id=e["id"], excerpt=e["excerpt"])
        for e in sorted((e for e in evidence if e.get("timestamp")), key=lambda e: e["timestamp"])
    ]

    report = dict(
        status=status,
        mode=state.get("mode", "deterministic_rules"),
        confidence_kind="heuristic_score_not_calibrated",
        synthetic=True,
        incident_service=state.get("incident_service"),
        root_cause=state.get("root_cause"),
        reason=state.get("reason"),
        stages=state.get("stages", []),
        hypotheses=state.get("ranked_hypotheses", []),
        evidence=evidence,
        knowledge_sources=state.get("knowledge_evidence", []),
        remediation=state.get("selected_remediation"),
        remediation_proposal=state.get("remediation_proposal"),
        unsupported_claims_count=state.get("unsupported_claims_count", 0),
        timeline=timeline,
    )

    _record_stage(state, "final_report", "ok", round((time.perf_counter() - t0) * 1e3, 2))
    report["stages"] = state.get("stages", [])
    return {"report": report, "status": status}


# Router conditionals
def route_after_telemetry(state: InvestigationState) -> str:
    if not state.get("evidence"):
        return "inconclusive_end"
    return "knowledge_retrieval"


def route_after_ranking(state: InvestigationState) -> str:
    if state.get("status") == "inconclusive":
        return "final_report"
    return "remediation_planning"


def build_investigation_graph():
    builder = StateGraph(InvestigationState)

    builder.add_node("intake", intake_node)
    builder.add_node("telemetry_collection", telemetry_node)
    builder.add_node("knowledge_retrieval", knowledge_retrieval_node)
    builder.add_node("hypothesis_generation", hypothesis_generation_node)
    builder.add_node("hypothesis_ranking", hypothesis_ranking_node)
    builder.add_node("remediation_planning", remediation_planning_node)
    builder.add_node("final_report", final_report_node)

    # Edges
    builder.set_entry_point("intake")
    builder.add_edge("intake", "telemetry_collection")

    builder.add_conditional_edges(
        "telemetry_collection",
        route_after_telemetry,
        {
            "inconclusive_end": "final_report",
            "knowledge_retrieval": "knowledge_retrieval",
        },
    )

    builder.add_edge("knowledge_retrieval", "hypothesis_generation")
    builder.add_edge("hypothesis_generation", "hypothesis_ranking")

    builder.add_conditional_edges(
        "hypothesis_ranking",
        route_after_ranking,
        {
            "final_report": "final_report",
            "remediation_planning": "remediation_planning",
        },
    )

    builder.add_edge("remediation_planning", "final_report")
    builder.add_edge("final_report", END)

    return builder.compile()


investigation_graph = build_investigation_graph()


def run_agent_investigation(
    observables: dict[str, Any],
    mode: str = "deterministic_rules",
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    t0 = time.perf_counter()
    initial_state: InvestigationState = {
        "observables": observables,
        "mode": mode,
        "config": config or D.DEFAULT_CONFIG,
        "stages": [],
    }
    result_state = investigation_graph.invoke(initial_state)
    report = result_state.get("report") or {}
    report["duration_ms"] = round((time.perf_counter() - t0) * 1e3, 2)
    return report
