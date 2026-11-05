"""SYNTHETIC scenario generator. The only module that knows ground truth.
generate() returns (observables, ground_truth); only observables may reach the diagnosis layer.
All telemetry is synthetic and clearly marked as such.
"""
import random
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

T0 = datetime(2026, 11, 5, 10, 0, tzinfo=UTC)

SPECS = {
    "db_pool": dict(
        cause="db_connection_pool_exhaustion",
        service="checkout-service",
        action="increase_pool_size",
        logs=["timeout waiting for connection from pool", "too many connections: pool exhausted"],
        metrics=[("checkout-service", "db_pool_usage_pct", 35, 100), ("checkout-service", "latency_p99_ms", 200, 4000)],
        decoys=[("email-worker", "retrying email send (decoy, unrelated)", "WARN")],
    ),
    "bad_deploy": dict(
        cause="bad_deployment",
        service="checkout-service",
        action="rollback_deployment",
        logs=["HTTP 500 unhandled exception in OrderSerializer", "NullPointer in order serialization"],
        metrics=[("checkout-service", "error_rate_pct", 1, 38)],
        deploy=True,
        decoys=[("inventory-service", "cache hit rate 99% (normal)", "INFO")],
    ),
    "redis_latency": dict(
        cause="redis_latency",
        service="checkout-service",
        action="clear_cache",
        logs=["redis GET timeout after 500ms", "redis slow response, request timed out"],
        metrics=[("redis-cache", "redis_latency_ms", 2, 450), ("checkout-service", "latency_p99_ms", 200, 2500)],
        decoys=[("checkout-service", "db connection pool check: 32% used (normal)", "INFO")],
    ),
    "memory_leak": dict(
        cause="memory_leak",
        service="inventory-service",
        action="restart_service",
        logs=["GC overhead limit exceeded", "container OOMKilled (out of memory)"],
        metrics=[("inventory-service", "memory_pct", 40, 98)],
        decoys=[("notification-service", "consumer lag 12 (nominal)", "INFO")],
    ),
    "payment_outage": dict(
        cause="payment_provider_failure",
        service="payment-service",
        action="enable_circuit_breaker",
        logs=["payment provider returned 503 unavailable", "payment provider timeout on charge"],
        metrics=[("payment-service", "provider_error_rate_pct", 1, 85)],
        decoys=[("api-gateway", "upstream response time normal on catalog", "INFO")],
    ),
    "queue_backlog": dict(
        cause="queue_backlog",
        service="notification-service",
        action="scale_service",
        logs=["queue backlog growing, consumer lag 5400", "consumer lag exceeds threshold"],
        metrics=[("notification-service", "queue_depth", 20, 9000)],
        decoys=[("email-worker", "worker threads active: 4/16", "INFO")],
    ),
    "cpu_saturation": dict(
        cause="cpu_saturation",
        service="api-gateway",
        action="scale_service",
        logs=["CPU throttling high, worker pool saturated", "thread starvation, latency spike"],
        metrics=[("api-gateway", "cpu_pct", 30, 98)],
        # Naive keyword baseline will match "pool" or "HTTP 500" from this decoy ERROR log and misclassify
        misleading_logs=[("api-gateway", "HTTP 500 upstream connection pool healthcheck probe", "ERROR")],
    ),
    "network_timeout": dict(
        cause="network_timeout",
        service="payment-service",
        action="enable_circuit_breaker",
        logs=["connect ETIMEDOUT 10.0.4.15:443", "TCP connection refused on upstream socket"],
        metrics=[("payment-service", "connection_errors_pct", 0.5, 48)],
        # Naive keyword baseline will match "consumer lag" from this decoy ERROR log and misclassify as queue_backlog
        misleading_logs=[("payment-service", "consumer lag metric read timeout during sync", "ERROR")],
    ),
}


@dataclass(frozen=True)
class GroundTruth:  # evaluator-only: NEVER queryable or returned to the diagnosis agent
    cause: str
    action: str
    required_evidence: frozenset


def _ts(m: float) -> str:
    return (T0 + timedelta(minutes=m)).isoformat()


def generate(name: str, seed: int = 0):
    s = SPECS[name]
    rng = random.Random(f"{name}:{seed}")
    logs, metrics, req = [], [], set()

    # Routine informational traffic
    for _ in range(10):
        logs.append(
            dict(
                id=f"log-{len(logs):03d}",
                ts=_ts(rng.randint(0, 38)),
                service="api-gateway",
                level="INFO",
                msg="request completed",
            )
        )

    # Standard decoy log
    logs.append(
        dict(
            id=f"log-{len(logs):03d}",
            ts=_ts(14),
            service="email-worker",
            level="WARN",
            msg="retrying email send (decoy, unrelated)",
        )
    )

    # Scenario-specific benign decoys
    for svc, msg, lvl in s.get("decoys", []):
        logs.append(dict(id=f"log-{len(logs):03d}", ts=_ts(13), service=svc, level=lvl, msg=msg))

    # Misleading decoy logs designed to fool naive regex baseline
    for svc, msg, lvl in s.get("misleading_logs", []):
        for _ in range(3):  # enough error count to dominate naive count
            logs.append(dict(id=f"log-{len(logs):03d}", ts=_ts(12), service=svc, level=lvl, msg=msg))

    # True symptom logs
    for i, msg in enumerate(s["logs"]):
        for k in range(3):
            rec = dict(
                id=f"log-{len(logs):03d}",
                ts=_ts(15 + i * 3 + k),
                service=s["service"],
                level="ERROR",
                msg=msg,
            )
            logs.append(rec)
            if k == 0:
                req.add("ev:" + rec["id"])

    # Metric series with synthetic baseline and anomalous peak
    series = list(s["metrics"])
    if not any(m[1] == "error_rate_pct" for m in series):
        series.append((s["service"], "error_rate_pct", 1.5, 1.5))  # plausible-but-unrelated baseline
    series.append(("email-worker", "cpu_pct", 40, 44))

    for svc, name_, base, peak in series:
        for k in range(8):
            v = base if k < 2 else base + (peak - base) * min(1, (k - 1) / 4)
            val = round(v * rng.uniform(0.97, 1.03), 2)
            rec_id = f"met-{svc}-{name_}-{k}"
            metrics.append(dict(id=rec_id, ts=_ts(k * 5), service=svc, name=name_, value=val))
        if (svc, name_) in {(m[0], m[1]) for m in s["metrics"]}:
            req.add(f"ev:met-{svc}-{name_}-7")

    # Deployments
    deploys = [dict(id="dep-001", ts=_ts(10), service="email-worker", changes=["bump template lib"])]
    if s.get("deploy"):
        deploys.append(dict(id="dep-002", ts=_ts(12), service=s["service"], changes=["refactor order serializer"]))

    obs = dict(
        synthetic=True,
        incident=dict(
            title=f"Degradation on {s['service']}",
            service=s["service"],
            detected_at=_ts(30),
            severity="high",
        ),
        logs=logs,
        metrics=metrics,
        deployments=deploys,
    )

    return obs, GroundTruth(s["cause"], s["action"], frozenset(req))
