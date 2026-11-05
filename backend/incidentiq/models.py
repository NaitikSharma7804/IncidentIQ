"""SQLAlchemy 2 database models for IncidentIQ.
Ground truth is strictly isolated and never stored in any operational table.
"""
import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from .database import Base


def _now():
    return datetime.now(UTC)


def _uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String(64), primary_key=True, default=_uuid)
    username = Column(String(64), unique=True, index=True, nullable=False)
    hashed_password = Column(String(256), nullable=False)
    role = Column(String(32), nullable=False, default="viewer")
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class Service(Base):
    __tablename__ = "services"

    id = Column(String(64), primary_key=True, default=_uuid)
    name = Column(String(64), unique=True, index=True, nullable=False)
    description = Column(String(255), nullable=True)
    tier = Column(String(32), default="tier-1", nullable=False)
    dependencies = Column(JSON, default=list, nullable=False)
    health_status = Column(String(32), default="healthy", nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String(64), primary_key=True, default=_uuid)
    title = Column(String(255), nullable=False)
    service = Column(String(64), ForeignKey("services.name"), index=True, nullable=False)
    severity = Column(String(32), nullable=False, default="medium")  # low, medium, high, critical
    status = Column(String(32), nullable=False, default="open")  # open, investigating, remediating, resolved, closed
    detected_at = Column(DateTime(timezone=True), nullable=False, index=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    synthetic = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    telemetry = relationship("TelemetryRecord", back_populates="incident", cascade="all, delete-orphan")
    investigations = relationship("Investigation", back_populates="incident", cascade="all, delete-orphan")
    remediations = relationship("RemediationAction", back_populates="incident", cascade="all, delete-orphan")


class TelemetryRecord(Base):
    __tablename__ = "telemetry_records"

    id = Column(String(64), primary_key=True, default=_uuid)
    incident_id = Column(String(64), ForeignKey("incidents.id", ondelete="CASCADE"), index=True, nullable=False)
    record_id = Column(String(64), index=True, nullable=False)
    source_type = Column(String(32), index=True, nullable=False)  # log, metric, deployment
    service = Column(String(64), index=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), index=True, nullable=False)
    payload = Column(JSON, nullable=False)

    incident = relationship("Incident", back_populates="telemetry")


class Investigation(Base):
    __tablename__ = "investigations"

    id = Column(String(64), primary_key=True, default=_uuid)
    incident_id = Column(String(64), ForeignKey("incidents.id", ondelete="CASCADE"), index=True, nullable=False)
    status = Column(String(32), nullable=False, default="running")  # running, completed, inconclusive, failed
    mode = Column(String(32), nullable=False, default="deterministic_rules")  # deterministic_rules, retrieval_assisted, llm_assisted
    root_cause = Column(String(128), nullable=True)
    confidence_score = Column(Float, nullable=True)
    confidence_kind = Column(String(64), default="heuristic_score_not_calibrated", nullable=False)
    duration_ms = Column(Float, nullable=True)
    started_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    report_data = Column(JSON, nullable=True)

    incident = relationship("Incident", back_populates="investigations")
    evidence_items = relationship("Evidence", back_populates="investigation", cascade="all, delete-orphan")
    hypotheses = relationship("Hypothesis", back_populates="investigation", cascade="all, delete-orphan")


class Evidence(Base):
    __tablename__ = "evidence"

    id = Column(String(64), primary_key=True, default=_uuid)
    investigation_id = Column(String(64), ForeignKey("investigations.id", ondelete="CASCADE"), index=True, nullable=False)
    evidence_id = Column(String(128), index=True, nullable=False)
    source_type = Column(String(32), index=True, nullable=False)  # log, metric, deployment, knowledge
    source_record_id = Column(String(64), nullable=True)
    service = Column(String(64), nullable=True)
    timestamp = Column(DateTime(timezone=True), nullable=True)
    excerpt = Column(Text, nullable=False)
    details = Column(JSON, nullable=True)

    investigation = relationship("Investigation", back_populates="evidence_items")


class Hypothesis(Base):
    __tablename__ = "hypotheses"

    id = Column(String(64), primary_key=True, default=_uuid)
    investigation_id = Column(String(64), ForeignKey("investigations.id", ondelete="CASCADE"), index=True, nullable=False)
    hypothesis_id = Column(String(64), nullable=False)
    rank = Column(Integer, nullable=False)
    category = Column(String(128), index=True, nullable=False)
    confidence = Column(Float, nullable=False)
    status = Column(String(32), default="candidate", nullable=False)  # candidate, rejected, accepted
    supporting_evidence = Column(JSON, default=list, nullable=False)
    contradicting_evidence = Column(JSON, default=list, nullable=False)
    missing_evidence = Column(JSON, default=list, nullable=False)
    explanation = Column(Text, nullable=False)

    investigation = relationship("Investigation", back_populates="hypotheses")


class RemediationAction(Base):
    __tablename__ = "remediation_actions"

    id = Column(String(64), primary_key=True, default=_uuid)
    incident_id = Column(String(64), ForeignKey("incidents.id", ondelete="CASCADE"), index=True, nullable=False)
    investigation_id = Column(String(64), ForeignKey("investigations.id", ondelete="SET NULL"), nullable=True)
    action_name = Column(String(64), nullable=False)
    service = Column(String(64), nullable=False)
    parameters = Column(JSON, nullable=False, default=dict)
    risk = Column(String(32), nullable=False)  # low, medium, high
    requester = Column(String(64), nullable=False)
    approval_status = Column(String(32), default="pending", nullable=False)  # not_required, pending, approved, rejected
    approver = Column(String(64), nullable=True)
    status = Column(String(32), default="proposed", nullable=False)  # proposed, executed, rejected, failed
    verification_status = Column(String(32), nullable=True)  # recovered, not_recovered
    payload_hash = Column(String(64), index=True, nullable=False)
    simulated = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    executed_at = Column(DateTime(timezone=True), nullable=True)

    incident = relationship("Incident", back_populates="remediations")
    approvals = relationship("Approval", back_populates="remediation_action", cascade="all, delete-orphan")


class Approval(Base):
    __tablename__ = "approvals"

    id = Column(String(64), primary_key=True, default=_uuid)
    remediation_action_id = Column(String(64), ForeignKey("remediation_actions.id", ondelete="CASCADE"), index=True, nullable=False)
    actor = Column(String(64), nullable=False)
    role = Column(String(32), nullable=False)
    decision = Column(String(32), nullable=False)  # approved, rejected
    payload_hash = Column(String(64), nullable=False)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    remediation_action = relationship("RemediationAction", back_populates="approvals")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(String(64), primary_key=True, default=_uuid)
    actor = Column(String(64), index=True, nullable=False)
    action = Column(String(64), index=True, nullable=False)  # login, logout, propose, approve, reject, execute, verify, access_denied
    resource_id = Column(String(128), index=True, nullable=True)
    outcome = Column(String(64), index=True, nullable=False)  # ok, denied_role, denied_self_approval, denied_no_approval, error
    details = Column(JSON, nullable=True)
    timestamp = Column(DateTime(timezone=True), index=True, default=_now, nullable=False)


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id = Column(String(64), primary_key=True, default=_uuid)
    title = Column(String(255), nullable=False)
    filename = Column(String(128), unique=True, index=True, nullable=False)
    doc_type = Column(String(32), default="runbook", nullable=False)
    service = Column(String(64), nullable=True)
    content = Column(Text, nullable=False)
    doc_metadata = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    chunks = relationship("KnowledgeChunk", back_populates="document", cascade="all, delete-orphan")


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id = Column(String(64), primary_key=True, default=_uuid)
    document_id = Column(String(64), ForeignKey("knowledge_documents.id", ondelete="CASCADE"), index=True, nullable=False)
    chunk_id = Column(String(64), unique=True, index=True, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    section = Column(String(128), nullable=True)
    content = Column(Text, nullable=False)
    embedding_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    document = relationship("KnowledgeDocument", back_populates="chunks")


class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"

    id = Column(String(64), primary_key=True, default=_uuid)
    dataset_name = Column(String(128), nullable=False)
    mode = Column(String(32), default="deterministic_rules", nullable=False)
    aggregate_metrics = Column(JSON, nullable=False)
    started_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    completed_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    results = relationship("EvaluationResult", back_populates="run", cascade="all, delete-orphan")


class EvaluationResult(Base):
    __tablename__ = "evaluation_results"

    id = Column(String(64), primary_key=True, default=_uuid)
    run_id = Column(String(64), ForeignKey("evaluation_runs.id", ondelete="CASCADE"), index=True, nullable=False)
    scenario = Column(String(64), index=True, nullable=False)
    seed = Column(Integer, nullable=False)
    status = Column(String(32), nullable=False)
    top1 = Column(Boolean, nullable=False)
    topk = Column(Boolean, nullable=False)
    baseline_top1 = Column(Boolean, nullable=False)
    ev_precision = Column(Float, nullable=True)
    ev_recall = Column(Float, nullable=True)
    unsupported_claims = Column(Boolean, nullable=False)
    action_ok = Column(Boolean, nullable=True)
    verified = Column(Boolean, nullable=True)
    latency_ms = Column(Float, nullable=False)
    details = Column(JSON, nullable=True)

    run = relationship("EvaluationRun", back_populates="results")
