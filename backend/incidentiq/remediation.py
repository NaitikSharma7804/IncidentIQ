"""Safe, SIMULATED remediation: strict allowlist, server-side risk, approval, idempotency, audit.
All infrastructure actions are simulated.
"""
import hashlib
import json
import uuid
from datetime import UTC, datetime

ACTIONS = {  # name -> (risk, param schema {name: (type, min, max)})
    "increase_pool_size": ("medium", {"pool_size": (int, 10, 500)}),
    "rollback_deployment": ("high", {"deployment_id": (str, None, None)}),
    "restart_service": ("medium", {"graceful": (bool, None, None)}),
    "clear_cache": ("low", {"cache": (str, None, None)}),
    "scale_service": ("medium", {"replicas": (int, 1, 20)}),
    "enable_circuit_breaker": ("medium", {"provider": (str, None, None)}),
}

SERVICES = {
    "api-gateway",
    "checkout-service",
    "payment-service",
    "inventory-service",
    "notification-service",
    "postgres-primary",
    "redis-cache",
    "email-worker",
}

APPROVER_ROLES = {"incident_commander", "admin"}

FIXES = {
    "db_connection_pool_exhaustion": {"increase_pool_size"},
    "bad_deployment": {"rollback_deployment"},
    "redis_latency": {"clear_cache"},
    "memory_leak": {"restart_service"},
    "payment_provider_failure": {"enable_circuit_breaker"},
    "queue_backlog": {"scale_service"},
    "cpu_saturation": {"scale_service", "restart_service"},
    "network_timeout": {"enable_circuit_breaker"},
}


class RemediationError(ValueError):
    pass


def compute_payload_hash(action_name: str, service: str, params: dict) -> str:
    serialized = json.dumps(
        {"action": action_name, "service": service, "params": params},
        sort_keys=True,
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


class Simulator:
    """Simulated infrastructure. Holds its own true condition; the diagnosis agent never sees it."""

    def __init__(self, true_cause):
        self._cause = true_cause
        self.applied = []

    def apply(self, action, params):
        self.applied.append((action, params))

    def verify(self, action):
        return "recovered" if action in FIXES.get(self._cause, set()) else "not_recovered"


class Engine:
    def __init__(self, simulator):
        self.sim = simulator
        self.actions = {}
        self.audit = []
        self._idem = {}

    def _log(self, actor, action, rid, outcome):
        self.audit.append(
            dict(
                actor=actor,
                action=action,
                resource=rid,
                outcome=outcome,
                ts=datetime.now(UTC).isoformat(),
            )
        )

    def propose(self, actor, name, service, params, idem_key=None):
        if name not in ACTIONS:
            raise RemediationError("action not in allowlist")
        if service not in SERVICES:
            raise RemediationError("unknown service")
        risk, schema = ACTIONS[name]
        if set(params) != set(schema):
            raise RemediationError("invalid parameters")
        for k, (t, lo, hi) in schema.items():
            v = params[k]
            if not isinstance(v, t) or (t is int and isinstance(v, bool)) or (lo is not None and not lo <= v <= hi):
                raise RemediationError(f"invalid parameter {k}")

        payload_hash = compute_payload_hash(name, service, params)
        key = idem_key or f"{name}:{service}:{sorted(params.items())}"
        if key in self._idem:
            return self.actions[self._idem[key]]

        rid = str(uuid.uuid4())
        self.actions[rid] = dict(
            id=rid,
            action=name,
            service=service,
            params=dict(params),
            risk=risk,
            requester=actor,
            approval="not_required" if risk == "low" else "pending",
            status="proposed",
            payload_hash=payload_hash,
            simulated=True,
        )
        self._idem[key] = rid
        self._log(actor, "propose", rid, "ok")
        return self.actions[rid]

    def approve(self, actor, role, rid):
        a = self.actions[rid]
        if role not in APPROVER_ROLES:
            self._log(actor, "approve", rid, "denied_role")
            raise PermissionError("role not permitted")
        if a["risk"] == "high" and actor == a["requester"]:
            self._log(actor, "approve", rid, "denied_self_approval")
            raise PermissionError("separation of duties")
        a.update(approval="approved", approver=actor)
        self._log(actor, "approve", rid, "ok")
        return a

    def reject(self, actor, role, rid, reason=""):
        a = self.actions[rid]
        if role not in APPROVER_ROLES:
            self._log(actor, "reject", rid, "denied_role")
            raise PermissionError("role not permitted")
        a.update(approval="rejected", status="rejected", reject_reason=reason)
        self._log(actor, "reject", rid, "ok")
        return a

    def execute(self, actor, role, rid):
        a = self.actions[rid]
        if a["status"] in ("executed",):
            return a  # idempotent: no second execution
        if a["approval"] not in ("approved", "not_required"):
            self._log(actor, "execute", rid, "denied_no_approval")
            raise PermissionError("approval required")
        if role not in APPROVER_ROLES | {"engineer"}:
            self._log(actor, "execute", rid, "denied_role")
            raise PermissionError("role not permitted")
        self.sim.apply(a["action"], a["params"])
        a.update(status="executed", executed_by=actor)
        self._log(actor, "execute", rid, "ok")
        return a

    def verify(self, rid):
        a = self.actions[rid]
        if a["status"] != "executed":
            raise RemediationError("not executed")
        a["verification"] = self.sim.verify(a["action"])
        self._log("system", "verify", rid, a["verification"])
        return a
