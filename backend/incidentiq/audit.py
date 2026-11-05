"""Persistent audit logger. Audit is distinct from operational application logs."""
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from .models import AuditEvent


def record_audit_event(
    db: Session,
    actor: str,
    action: str,
    outcome: str,
    resource_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> AuditEvent:
    event = AuditEvent(
        id=str(uuid.uuid4()),
        actor=actor,
        action=action,
        outcome=outcome,
        resource_id=resource_id,
        details=details or {},
        timestamp=datetime.now(UTC),
    )
    db.add(event)
    try:
        db.commit()
        db.refresh(event)
    except Exception:
        db.rollback()
        raise
    return event
