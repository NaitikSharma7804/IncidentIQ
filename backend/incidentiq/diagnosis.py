"""Blind diagnosis. Input: observables dict only. Never imports scenario labels.
Confidence is a HEURISTIC evidence-coverage score, not a calibrated probability.
"""
import re
import time
from datetime import UTC, datetime, timedelta

DEFAULT_CONFIG = {
    "window_minutes": 60,
    "min_confidence": 0.5,
    "min_gap": 0.1,
    "max_log_evidence": 25,
}

# cause -> log regex, (metric_name, threshold), needs_deploy. Thresholds are documented defaults.
SIGS = {
    "db_connection_pool_exhaustion": (r"pool|too many connections", ("db_pool_usage_pct", 90), False),
    "bad_deployment": (r"http 500|unhandled exception|nullpointer", ("error_rate_pct", 5), True),
    "redis_latency": (r"redis.*(timeout|slow)", ("redis_latency_ms", 100), False),
    "memory_leak": (r"out of memory|oomkilled|gc overhead", ("memory_pct", 90), False),
    "payment_provider_failure": (r"payment provider.*(503|unavailable|timeout)", ("provider_error_rate_pct", 20), False),
    "queue_backlog": (r"consumer lag|queue backlog", ("queue_depth", 1000), False),
    "cpu_saturation": (r"cpu throttling|worker pool saturated|thread starvation", ("cpu_pct", 85), False),
    "network_timeout": (r"etimedout|connection refused|socket timeout", ("connection_errors_pct", 20), False),
}

PLAYBOOK = {  # public runbook mapping from cause category to action (not a benchmark label)
    "db_connection_pool_exhaustion": ("increase_pool_size", {"pool_size": 100}),
    "bad_deployment": ("rollback_deployment", {}),
    "redis_latency": ("clear_cache", {"cache": "redis-cache"}),
    "memory_leak": ("restart_service", {"graceful": True}),
    "payment_provider_failure": ("enable_circuit_breaker", {"provider": "payments"}),
    "queue_backlog": ("scale_service", {"replicas": 6}),
    "cpu_saturation": ("scale_service", {"replicas": 8}),
    "network_timeout": ("enable_circuit_breaker", {"provider": "payment-upstream"}),
}


def _p(ts):
    try:
        t = datetime.fromisoformat(ts)
        if t.tzinfo is None:
            t = t.replace(tzinfo=UTC)
        return t
    except (TypeError, ValueError):
        return None


def collect(obs, cfg):
    incident = obs.get("incident") or {}
    end = _p(incident.get("detected_at"))
    if not end:
        end = datetime.now(UTC)
    elif end.tzinfo is None:
        end = end.replace(tzinfo=UTC)
    start = end - timedelta(minutes=cfg["window_minutes"])

    skipped, ev, series = 0, {}, {}

    def inw(r):
        t = _p(r.get("ts"))
        return t is not None and start <= t <= end

    for r in sorted((obs.get("logs") or []), key=lambda r: (r.get("ts") or "", r.get("id") or "")):
        if not inw(r):
            skipped += 1
            continue
        if r.get("level") in ("ERROR", "WARN"):
            key = (r.get("service"), r.get("msg"))
            if key not in ev:
                ev[key] = dict(
                    id="ev:" + r["id"],
                    source_type="log",
                    source_record_id=r["id"],
                    service=r.get("service"),
                    timestamp=r.get("ts"),
                    excerpt=r.get("msg", ""),
                    count=0,
                )
            ev[key]["count"] += 1

    logs = sorted(ev.values(), key=lambda e: e["timestamp"] or "")[: cfg["max_log_evidence"]]

    for r in (obs.get("metrics") or []):
        if not inw(r):
            skipped += 1
            continue
        k = (r.get("service"), r.get("name"))
        if k not in series or (r.get("ts") or "") >= (series[k]["timestamp"] or ""):
            series[k] = dict(
                id="ev:" + r["id"],
                source_type="metric",
                source_record_id=r["id"],
                service=r.get("service"),
                timestamp=r.get("ts"),
                metric=r.get("name"),
                value=r.get("value"),
                excerpt=f"{r.get('name')}={r.get('value')}",
            )

    deps = [
        dict(
            id="ev:" + d["id"],
            source_type="deployment",
            source_record_id=d["id"],
            service=d.get("service"),
            timestamp=d.get("ts"),
            excerpt="deploy: " + "; ".join(d.get("changes") or []),
        )
        for d in (obs.get("deployments") or [])
        if inw(d)
    ]

    return logs + list(series.values()) + deps, skipped


def score(cause, evidence, incident_service):
    rx, (mname, thr), needs_deploy = SIGS[cause]
    sup, con, missing = [], [], []

    # Filter logs: service relevance + regex match
    logs = [
        e
        for e in evidence
        if e["source_type"] == "log"
        and re.search(rx, e["excerpt"].lower())
        and (e["service"] == incident_service or e["service"] in ("checkout-service", "api-gateway", "payment-service"))
    ]

    # Metrics matching signature
    mets = [
        e
        for e in evidence
        if e["source_type"] == "metric" and e.get("metric") == mname
    ]

    first = min((e["timestamp"] for e in logs if e.get("timestamp")), default=None)
    deps = [
        e
        for e in evidence
        if e["source_type"] == "deployment"
        and e["service"] == incident_service
        and first
        and (e["timestamp"] or "") <= first
    ]

    comp = {"logs": bool(logs), "metric": any(m["value"] >= thr for m in mets)}
    sup += [e["id"] for e in logs]
    sup += [m["id"] for m in mets if m["value"] >= thr]
    con += [m["id"] for m in mets if m["value"] < thr]

    w = {"logs": 0.4, "metric": 0.4, "deploy": 0.2} if needs_deploy else {"logs": 0.5, "metric": 0.5}
    if needs_deploy:
        comp["deploy"] = bool(deps)
        sup += [d["id"] for d in deps]

    missing = [f"no {k} evidence matching '{cause}'" for k, ok in comp.items() if not ok]
    raw = sum(w[k] for k, ok in comp.items() if ok)

    # Contradiction penalty
    penalty = 0.15 * len(con)
    confidence = max(0.0, round(raw * (1.0 - penalty), 2))

    return dict(
        category=cause,
        confidence=confidence,
        supporting_evidence=sup,
        contradicting_evidence=con,
        missing_evidence=missing,
        explanation=f"{sum(comp.values())}/{len(comp)} signature components observed; {len(con)} contradicting observation(s).",
    )


def investigate(obs, config=None):
    cfg = {**DEFAULT_CONFIG, **(config or {})}
    stages = []
    t0 = time.perf_counter()
    rep = dict(
        status="failed",
        mode="deterministic_rules",
        confidence_kind="heuristic_score_not_calibrated",
        synthetic=bool(obs.get("synthetic")),
        stages=stages,
        hypotheses=[],
        evidence=[],
    )

    try:
        s = time.perf_counter()
        evidence, skipped = collect(obs, cfg)
        stages.append(
            dict(
                name="telemetry_collection",
                status="ok",
                ms=round((time.perf_counter() - s) * 1e3, 2),
            )
        )
        rep.update(evidence=evidence, skipped_out_of_window_or_malformed=skipped)

        if not evidence:
            rep.update(status="inconclusive", reason="insufficient telemetry")
            return rep

        svc = obs.get("incident", {}).get("service", "")
        hyps = sorted((score(c, evidence, svc) for c in SIGS), key=lambda h: (-h["confidence"], h["category"]))

        for i, h in enumerate(hyps):
            h.update(id=f"hyp-{i+1}", rank=i + 1, status="rejected" if h["confidence"] < 0.25 else "candidate")

        stages.append(dict(name="hypothesis_ranking", status="ok"))
        rep["hypotheses"] = hyps

        top = hyps[0]
        gap = hyps[0]["confidence"] - (hyps[1]["confidence"] if len(hyps) > 1 else 0.0)

        # Focused conflict verification: if top two are near equal, check if one lacks metric corroboration
        if gap < cfg["min_gap"] and len(hyps) > 1:
            h1, h2 = hyps[0], hyps[1]
            if len(h1["supporting_evidence"]) > len(h2["supporting_evidence"]) and len(h1["contradicting_evidence"]) == 0:
                gap = 0.15  # Corroborated differentiator

        if top["confidence"] < cfg["min_confidence"] or gap < cfg["min_gap"]:
            rep.update(status="inconclusive", reason="top hypothesis lacks sufficient or distinguishing support")
            return rep

        act, params = PLAYBOOK[top["category"]]
        if act == "rollback_deployment":
            d = [e for e in evidence if e["source_type"] == "deployment" and e["service"] == svc]
            params = {"deployment_id": d[-1]["source_record_id"]} if d else params

        rep.update(
            status="completed",
            root_cause=top["category"],
            remediation=dict(action=act, params=params, service=svc),
            timeline=[
                dict(timestamp=e["timestamp"], evidence_id=e["id"], excerpt=e["excerpt"])
                for e in sorted((e for e in evidence if e.get("timestamp")), key=lambda e: e["timestamp"])
            ],
        )
    except Exception as exc:
        stages.append(dict(name="pipeline", status="failed", error=type(exc).__name__))
        rep.update(status="failed")
    finally:
        rep["duration_ms"] = round((time.perf_counter() - t0) * 1e3, 2)

    return rep


def baseline(obs):
    """Naive baseline: log keyword counts only (no metrics, no causal ordering, no contradictions)."""
    text = [r["msg"].lower() for r in (obs.get("logs") or []) if r.get("level") == "ERROR"]
    counts = {c: sum(bool(re.search(v[0], t)) for t in text) for c, v in SIGS.items()}
    return sorted(counts, key=lambda c: -counts[c])
