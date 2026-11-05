import copy
import inspect

import jwt
import pytest
from fastapi.testclient import TestClient

from incidentiq import api
from incidentiq import diagnosis as D
from incidentiq import evaluation as E
from incidentiq import remediation as R
from incidentiq import scenarios as S


def test_diagnosis_input_independent_of_hidden_label():
    obs, gt = S.generate("db_pool", 1); before = copy.deepcopy(obs)
    other_obs, other_gt = S.generate("db_pool", 1)
    assert obs == other_obs == before and not hasattr(D, "GroundTruth")
    assert D.investigate(obs)["root_cause"] == D.investigate(other_obs)["root_cause"]

def test_diagnosis_code_cannot_reference_labels():
    src = inspect.getsource(D).lower()
    for banned in ("groundtruth", "ground_truth", "expected_remediation", "required_evidence", "import scenarios", "from . import scenarios"): assert banned not in src
    assert "ground" not in str(S.generate("bad_deploy")[0]).lower()

@pytest.mark.parametrize("name", list(S.SPECS))
def test_each_scenario_diagnosed_blind(name):
    obs, gt = S.generate(name, 0); rep = D.investigate(obs)
    assert rep["status"] == "completed" and rep["root_cause"] == gt.cause and rep["remediation"]["action"] == gt.action
    ids = {e["id"] for e in rep["evidence"]}
    assert all(i in ids for h in rep["hypotheses"] for i in h["supporting_evidence"] + h["contradicting_evidence"])

def test_contradicting_evidence_and_no_fixed_confidence():
    rep = D.investigate(S.generate("db_pool")[0]); bd = next(h for h in rep["hypotheses"] if h["category"] == "bad_deployment")
    assert bd["contradicting_evidence"] and bd["status"] == "rejected"
    assert len({h["confidence"] for h in rep["hypotheses"]}) > 1

def test_time_window_and_malformed_records():
    obs, _ = S.generate("db_pool"); obs["logs"] += [dict(id="x1", ts="2020-01-01T00:00:00+00:00", service="a", level="ERROR", msg="pool old"), dict(id="x2", service="a", level="ERROR", msg="no ts")]
    rep = D.investigate(obs); assert "ev:x1" not in {e["id"] for e in rep["evidence"]} and rep["skipped_out_of_window_or_malformed"] >= 2
    assert D.investigate(obs, {"window_minutes": 5})["status"] != "failed"

def test_insufficient_evidence_is_inconclusive():
    obs, _ = S.generate("db_pool"); obs["logs"], obs["metrics"], obs["deployments"] = [], [], None
    assert D.investigate(obs)["status"] == "inconclusive"
    obs2, _ = S.generate("memory_leak"); obs2["logs"] = [l for l in obs2["logs"] if l["level"] == "INFO"]; obs2["metrics"] = []
    assert D.investigate(obs2)["status"] == "inconclusive"

def test_evidence_ids_stable_across_runs():
    a = D.investigate(S.generate("redis_latency", 2)[0]); b = D.investigate(S.generate("redis_latency", 2)[0])
    assert [e["id"] for e in a["evidence"]] == [e["id"] for e in b["evidence"]]

def test_remediation_validation_and_approval():
    e = R.Engine(R.Simulator("bad_deployment"))
    for bad in [("rm -rf /", "checkout-service", {}), ("clear_cache", "unknown", {"cache": "x"}), ("scale_service", "checkout-service", {"replicas": 999}), ("clear_cache", "redis-cache", {"cache": "x", "cmd": "ls"})]:
        with pytest.raises(R.RemediationError): e.propose("u", *bad)
    a = e.propose("eng", "rollback_deployment", "checkout-service", {"deployment_id": "dep-002"})
    with pytest.raises(PermissionError): e.execute("eng", "engineer", a["id"])      # no approval
    with pytest.raises(PermissionError): e.approve("eng", "engineer", a["id"])      # role
    with pytest.raises(PermissionError): e.approve("eng", "admin", a["id"])         # self-approval on high risk
    e.approve("cmdr", "incident_commander", a["id"]); e.execute("eng", "engineer", a["id"]); e.execute("eng", "engineer", a["id"])
    assert len(e.sim.applied) == 1 and e.verify(a["id"])["verification"] == "recovered" and any(x["outcome"] == "denied_no_approval" for x in e.audit)

def test_wrong_fix_not_reported_as_success():
    e = R.Engine(R.Simulator("memory_leak")); a = e.propose("u", "clear_cache", "redis-cache", {"cache": "x"}); e.execute("u", "engineer", a["id"])
    assert e.verify(a["id"])["verification"] == "not_recovered"

def test_evaluation_metrics_defined_and_reproducible():
    r1, r2 = E.run(), E.run(); a = r1["aggregate"]
    assert a["n"] == 18 and 0 <= a["top1"] <= 1 and a["top1"] >= a["baseline_top1"]
    assert {k: v for k, v in a.items() if k != "mean_latency_ms"} == {k: v for k, v in r2["aggregate"].items() if k != "mean_latency_ms"}

c = TestClient(api.app)
def tok(role): return {"Authorization": "Bearer " + c.post("/api/v1/auth/login", json={"username": f"demo-{role}", "password": "demo-only"}).json()["access_token"]}

def test_api_full_flow_and_rbac():
    assert c.post("/api/v1/incidents/synthetic", json={"scenario": "bad_deploy"}).status_code == 401
    assert c.post("/api/v1/incidents/synthetic", json={"scenario": "bad_deploy"}, headers=tok("viewer")).status_code == 403
    inc = c.post("/api/v1/incidents/synthetic", json={"scenario": "bad_deploy"}, headers=tok("engineer")).json()
    assert "ground" not in str(inc).lower() and "cause" not in str(inc).lower()
    rep = c.post(f"/api/v1/incidents/{inc['id']}/investigate", headers=tok("engineer")).json(); rid = rep["remediation_proposal"]["id"]; base = f"/api/v1/incidents/{inc['id']}/remediations/{rid}"
    assert "ground" not in str(rep).lower() and rep["root_cause"] == "bad_deployment"
    assert c.post(base + "/execute", headers=tok("engineer")).status_code == 403
    assert c.post(base + "/approve", headers=tok("engineer")).status_code == 403
    assert c.post(base + "/approve", headers=tok("incident_commander")).status_code == 200
    assert c.post(base + "/execute", headers=tok("engineer")).json()["status"] == "executed"
    assert c.post(base + "/verify", headers=tok("engineer")).json()["verification"] == "recovered"
    assert c.post("/api/v1/evaluations/run", headers=tok("engineer")).status_code == 403

def test_jwt_validation():
    assert c.get("/health").status_code == 200
    h = {"Authorization": "Bearer garbage"}; assert c.post("/api/v1/evaluations/run", headers=h).status_code == 401
    expired = jwt.encode({"sub": "demo-admin", "role": "admin", "iat": 1, "exp": 2}, api.SECRET, algorithm="HS256")
    assert c.post("/api/v1/evaluations/run", headers={"Authorization": "Bearer " + expired}).status_code == 401
    inactive = api.make_token("demo-disabled", "admin"); assert c.post("/api/v1/evaluations/run", headers={"Authorization": "Bearer " + inactive}).status_code == 403
    t = api.make_token("demo-viewer", "viewer", extra={"role": "admin", "sub": "demo-admin", "exp": 9999999999})
    d = jwt.decode(t, api.SECRET, algorithms=["HS256"]); assert d["role"] == "viewer" and d["sub"] == "demo-viewer" and d["exp"] < 9999999999
    forged = jwt.encode({"sub": "demo-viewer", "role": "admin", "iat": 1, "exp": 9999999999}, api.SECRET, algorithm="HS256")
    assert c.post("/api/v1/evaluations/run", headers={"Authorization": "Bearer " + forged}).status_code == 403  # role taken from server record

def test_production_requires_secret(monkeypatch):
    import importlib; monkeypatch.setenv("INCIDENTIQ_ENV", "production"); monkeypatch.setenv("INCIDENTIQ_JWT_SECRET", "change-me")
    with pytest.raises(RuntimeError): importlib.reload(api)
    monkeypatch.delenv("INCIDENTIQ_ENV"); monkeypatch.delenv("INCIDENTIQ_JWT_SECRET"); importlib.reload(api)

def test_cors_never_wildcard_with_credentials(monkeypatch):
    assert "*" not in api.origins
