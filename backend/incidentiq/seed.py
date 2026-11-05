"""Deterministic, idempotent database seeding.
Run once or repeatedly without side effects or duplicates.
"""
from datetime import datetime

import argon2
from sqlalchemy.orm import Session

from . import scenarios as S
from .config import get_settings
from .database import SessionLocal
from .models import Incident, Service, TelemetryRecord, User

ph = argon2.PasswordHasher()
settings = get_settings()

DEFAULT_SERVICES = [
    {
        "name": "api-gateway",
        "description": "Public edge API gateway and reverse proxy",
        "tier": "tier-1",
        "dependencies": ["checkout-service", "payment-service", "inventory-service", "notification-service"],
        "health_status": "healthy",
    },
    {
        "name": "checkout-service",
        "description": "Core checkout and order processing service",
        "tier": "tier-1",
        "dependencies": ["postgres-primary", "redis-cache", "payment-service", "inventory-service"],
        "health_status": "degraded",
    },
    {
        "name": "payment-service",
        "description": "External payment integration service",
        "tier": "tier-1",
        "dependencies": ["postgres-primary"],
        "health_status": "healthy",
    },
    {
        "name": "inventory-service",
        "description": "Catalog and warehouse inventory tracker",
        "tier": "tier-2",
        "dependencies": ["postgres-primary"],
        "health_status": "healthy",
    },
    {
        "name": "notification-service",
        "description": "Async transactional notifications and queue processor",
        "tier": "tier-2",
        "dependencies": ["postgres-primary"],
        "health_status": "healthy",
    },
    {
        "name": "postgres-primary",
        "description": "Primary relational database cluster",
        "tier": "tier-0",
        "dependencies": [],
        "health_status": "healthy",
    },
    {
        "name": "redis-cache",
        "description": "In-memory caching and session store",
        "tier": "tier-0",
        "dependencies": [],
        "health_status": "healthy",
    },
    {
        "name": "email-worker",
        "description": "Background worker for email dispatch",
        "tier": "tier-3",
        "dependencies": ["notification-service"],
        "health_status": "healthy",
    },
]

DEMO_USERS = [
    {"username": "demo-viewer", "role": "viewer", "active": True},
    {"username": "demo-engineer", "role": "engineer", "active": True},
    {"username": "demo-incident_commander", "role": "incident_commander", "active": True},
    {"username": "demo-admin", "role": "admin", "active": True},
    {"username": "demo-disabled", "role": "admin", "active": False},
]


def seed_services(db: Session) -> int:
    created = 0
    for s_data in DEFAULT_SERVICES:
        existing = db.query(Service).filter_by(name=s_data["name"]).first()
        if not existing:
            svc = Service(
                id=f"svc-{s_data['name']}",
                name=s_data["name"],
                description=s_data["description"],
                tier=s_data["tier"],
                dependencies=s_data["dependencies"],
                health_status=s_data["health_status"],
            )
            db.add(svc)
            created += 1
        else:
            existing.description = s_data["description"]
            existing.tier = s_data["tier"]
            existing.dependencies = s_data["dependencies"]
            existing.health_status = s_data["health_status"]
    db.commit()
    return created


def seed_users(db: Session) -> int:
    created = 0
    raw_pw = settings.incidentiq_demo_password
    hashed_pw = ph.hash(raw_pw)
    for u_data in DEMO_USERS:
        existing = db.query(User).filter_by(username=u_data["username"]).first()
        if not existing:
            user = User(
                id=f"usr-{u_data['username']}",
                username=u_data["username"],
                hashed_password=hashed_pw,
                role=u_data["role"],
                active=u_data["active"],
            )
            db.add(user)
            created += 1
        else:
            existing.role = u_data["role"]
            existing.active = u_data["active"]
            # Keep password up to date with demo password
            if not ph.check_needs_rehash(existing.hashed_password):
                try:
                    ph.verify(existing.hashed_password, raw_pw)
                except Exception:
                    existing.hashed_password = hashed_pw
    db.commit()
    return created


def seed_demo_incidents(db: Session) -> int:
    created = 0
    demo_scenarios = [("db_pool", 0, "inc-seed-001"), ("bad_deploy", 0, "inc-seed-002")]
    for scenario_name, seed, inc_id in demo_scenarios:
        existing = db.query(Incident).filter_by(id=inc_id).first()
        if not existing:
            obs, _gt = S.generate(scenario_name, seed)
            inc_meta = obs["incident"]
            detected_dt = datetime.fromisoformat(inc_meta["detected_at"])
            incident = Incident(
                id=inc_id,
                title=inc_meta["title"],
                service=inc_meta["service"],
                severity=inc_meta.get("severity", "high"),
                status="open",
                detected_at=detected_dt,
                synthetic=True,
            )
            db.add(incident)

            # Seed telemetry records (logs, metrics, deployments)
            for log in obs.get("logs", []):
                rec = TelemetryRecord(
                    id=f"{inc_id}-{log['id']}",
                    incident_id=inc_id,
                    record_id=log["id"],
                    source_type="log",
                    service=log["service"],
                    timestamp=datetime.fromisoformat(log["ts"]),
                    payload=log,
                )
                db.add(rec)

            for met in obs.get("metrics", []):
                rec = TelemetryRecord(
                    id=f"{inc_id}-{met['id']}",
                    incident_id=inc_id,
                    record_id=met["id"],
                    source_type="metric",
                    service=met["service"],
                    timestamp=datetime.fromisoformat(met["ts"]),
                    payload=met,
                )
                db.add(rec)

            for dep in obs.get("deployments", []):
                rec = TelemetryRecord(
                    id=f"{inc_id}-{dep['id']}",
                    incident_id=inc_id,
                    record_id=dep["id"],
                    source_type="deployment",
                    service=dep["service"],
                    timestamp=datetime.fromisoformat(dep["ts"]),
                    payload=dep,
                )
                db.add(rec)

            created += 1
    db.commit()
    return created


def seed_all() -> dict:
    db = SessionLocal()
    try:
        svc_count = seed_services(db)
        usr_count = seed_users(db)
        inc_count = seed_demo_incidents(db)
        return {"services_seeded": svc_count, "users_seeded": usr_count, "incidents_seeded": inc_count}
    finally:
        db.close()


if __name__ == "__main__":
    result = seed_all()
    print("Seed complete:", result)
