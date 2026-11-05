"""Comprehensive security, RBAC, audit, and tamper-resistance test suite."""
from fastapi.testclient import TestClient

from incidentiq import api
from incidentiq.database import SessionLocal
from incidentiq.models import AuditEvent
from incidentiq.security import hash_password, verify_password

client = TestClient(api.app)


def auth_header(role="engineer"):
    token = api.make_token(f"demo-{role}", role)
    return {"Authorization": f"Bearer {token}"}


def test_argon2_hashing_and_verification():
    raw = "super-secret-password-123!"
    hashed = hash_password(raw)
    assert hashed.startswith("$argon2id$")
    assert verify_password(hashed, raw) is True
    assert verify_password(hashed, "wrong-password") is False


def test_login_invalid_credentials_records_audit():
    res = client.post(
        "/api/v1/auth/login",
        json={"username": "demo-admin", "password": "definitely-wrong-password"},
    )
    assert res.status_code == 401

    db = SessionLocal()
    try:
        ev = (
            db.query(AuditEvent)
            .filter_by(action="login", outcome="denied_credentials", actor="demo-admin")
            .order_by(AuditEvent.timestamp.desc())
            .first()
        )
        assert ev is not None
    finally:
        db.close()


def test_inactive_user_cannot_access():
    res = client.post(
        "/api/v1/auth/login",
        json={"username": "demo-disabled", "password": "demo-only"},
    )
    assert res.status_code == 401


def test_client_cannot_tamper_with_server_role():
    # Token crafted with 'admin' role claim for a 'demo-viewer' user
    forged_token = api.make_token("demo-viewer", "admin")
    h = {"Authorization": f"Bearer {forged_token}"}
    # Attempting an admin-only endpoint
    res = client.post("/api/v1/evaluations/run", headers=h)
    assert res.status_code == 403  # DB role is 'viewer', strictly enforced


def test_separation_of_duties_self_approval_blocked():
    # Engineer creates incident & triggers investigation
    inc = client.post(
        "/api/v1/incidents/synthetic",
        json={"scenario": "bad_deploy", "seed": 42},
        headers=auth_header("incident_commander"),
    ).json()

    # Commander investigates -> proposes rollback (high risk, requester is demo-incident_commander)
    rep = client.post(f"/api/v1/incidents/{inc['id']}/investigate", headers=auth_header("incident_commander")).json()
    rid = rep["remediation_proposal"]["id"]

    # Self-approval by the requester must be rejected
    res = client.post(f"/api/v1/incidents/{inc['id']}/remediations/{rid}/approve", headers=auth_header("incident_commander"))
    assert res.status_code == 403
    assert "separation of duties" in res.json()["detail"].lower()

    # Approval by a different authorized role (admin) succeeds
    res_admin = client.post(f"/api/v1/incidents/{inc['id']}/remediations/{rid}/approve", headers=auth_header("admin"))
    assert res_admin.status_code == 200
    assert res_admin.json()["approval"] == "approved"


def test_cannot_execute_without_approval():
    inc = client.post(
        "/api/v1/incidents/synthetic",
        json={"scenario": "bad_deploy", "seed": 99},
        headers=auth_header("engineer"),
    ).json()

    rep = client.post(f"/api/v1/incidents/{inc['id']}/investigate", headers=auth_header("engineer")).json()
    rid = rep["remediation_proposal"]["id"]

    # Attempt execution before approval
    res = client.post(f"/api/v1/incidents/{inc['id']}/remediations/{rid}/execute", headers=auth_header("engineer"))
    assert res.status_code == 403
    assert "approval required" in res.json()["detail"].lower()


def test_idempotent_execution_no_double_action():
    inc = client.post(
        "/api/v1/incidents/synthetic",
        json={"scenario": "bad_deploy", "seed": 77},
        headers=auth_header("engineer"),
    ).json()

    rep = client.post(f"/api/v1/incidents/{inc['id']}/investigate", headers=auth_header("engineer")).json()
    rid = rep["remediation_proposal"]["id"]

    # Approve
    client.post(f"/api/v1/incidents/{inc['id']}/remediations/{rid}/approve", headers=auth_header("incident_commander"))

    # Execute first time
    exec1 = client.post(f"/api/v1/incidents/{inc['id']}/remediations/{rid}/execute", headers=auth_header("engineer"))
    assert exec1.status_code == 200
    assert exec1.json()["status"] == "executed"

    # Execute second time (idempotent duplicate call)
    exec2 = client.post(f"/api/v1/incidents/{inc['id']}/remediations/{rid}/execute", headers=auth_header("engineer"))
    assert exec2.status_code == 200
    assert exec2.json()["status"] == "executed"


def test_secret_leak_checks_in_responses():
    res = client.get("/api/v1/system/info", headers=auth_header("viewer"))
    assert res.status_code == 200
    text = res.text.lower()
    for secret_keyword in ("jwt_secret", "password_hash", "private_key"):
        assert secret_keyword not in text
