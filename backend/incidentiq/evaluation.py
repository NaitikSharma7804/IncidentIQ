"""Evaluator: the only place ground truth is compared, always AFTER predictions exist.
Saves runs and per-scenario evaluations to the database and exports JSON/CSV.
"""
import csv
import io
import json
import sys
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from . import diagnosis as D
from . import remediation as R
from . import scenarios as S
from .database import SessionLocal
from .models import EvaluationResult, EvaluationRun


def _mean(xs):
    return round(sum(xs) / len(xs), 3) if xs else None  # None = unavailable (no denominator)


def run(seeds=(0, 1, 2), k=3, scenarios=None, save_to_db=False, db: Session | None = None, mode="deterministic_rules"):
    # If scenarios not specified, use the core 6 scenarios by default to preserve baseline test compatibility,
    # or all scenarios if specified.
    scenario_list = scenarios if scenarios is not None else list(S.SPECS)[:6]
    rows = []
    started_at = datetime.now(UTC)

    for name in scenario_list:
        for seed in seeds:
            obs, gt = S.generate(name, seed)
            rep = D.investigate(obs)
            base = D.baseline(obs)  # predictions finalized first
            ranked = [h["category"] for h in rep["hypotheses"]]
            cited = {e for h in rep["hypotheses"][:1] for e in h["supporting_evidence"]}
            ids = {e["id"] for e in rep["evidence"]}

            ev_prec = (len(cited & gt.required_evidence) / len(cited)) if cited else None
            ev_rec = (len(cited & gt.required_evidence) / len(gt.required_evidence)) if gt.required_evidence else None

            row = dict(
                scenario=name,
                seed=seed,
                status=rep["status"],
                top1=bool(ranked) and ranked[0] == gt.cause,
                topk=gt.cause in ranked[:k],
                baseline_top1=base[0] == gt.cause,
                latency_ms=rep["duration_ms"],
                ev_precision=ev_prec,
                ev_recall=ev_rec,
                unsupported=any(e not in ids for e in cited),
                action_ok=None,
                verified=None,
            )

            if rep["status"] == "completed":
                r = rep["remediation"]
                row["action_ok"] = r["action"] == gt.action
                eng = R.Engine(R.Simulator(gt.cause))
                a = eng.propose("agent", r["action"], r["service"], r["params"])
                if a["approval"] == "pending":
                    eng.approve("cmdr", "incident_commander", a["id"])
                eng.execute("cmdr", "incident_commander", a["id"])
                row["verified"] = eng.verify(a["id"])["verification"] == "recovered"

            rows.append(row)

    n = len(rows)
    b = lambda key: _mean([float(r[key]) for r in rows if r[key] is not None])
    agg = dict(
        n=n,
        top1=b("top1"),
        topk=b("topk"),
        baseline_top1=b("baseline_top1"),
        evidence_precision=b("ev_precision"),
        evidence_recall=b("ev_recall"),
        unsupported_claim_rate=b("unsupported"),
        remediation_accuracy=b("action_ok"),
        verification_success=b("verified"),
        inconclusive_rate=_mean([float(r["status"] == "inconclusive") for r in rows]),
        failure_rate=_mean([float(r["status"] == "failed") for r in rows]),
        mean_latency_ms=_mean([r["latency_ms"] for r in rows]),
    )

    completed_at = datetime.now(UTC)
    dataset_name = f"synthetic-{len(scenario_list)}-scenarios"
    out = dict(
        dataset=dataset_name,
        seeds=list(seeds),
        scenarios=scenario_list,
        mode=mode,
        aggregate=agg,
        per_scenario=rows,
    )

    if save_to_db:
        session = db or SessionLocal()
        should_close = db is None
        try:
            run_rec = EvaluationRun(
                id=str(uuid.uuid4()),
                dataset_name=dataset_name,
                mode=mode,
                aggregate_metrics=agg,
                started_at=started_at,
                completed_at=completed_at,
            )
            session.add(run_rec)
            for r in rows:
                res_rec = EvaluationResult(
                    id=str(uuid.uuid4()),
                    run_id=run_rec.id,
                    scenario=r["scenario"],
                    seed=r["seed"],
                    status=r["status"],
                    top1=r["top1"],
                    topk=r["topk"],
                    baseline_top1=r["baseline_top1"],
                    ev_precision=r["ev_precision"],
                    ev_recall=r["ev_recall"],
                    unsupported_claims=r["unsupported"],
                    action_ok=r["action_ok"],
                    verified=r["verified"],
                    latency_ms=r["latency_ms"],
                    details=r,
                )
                session.add(res_rec)
            session.commit()
            out["run_id"] = run_rec.id
        finally:
            if should_close:
                session.close()

    return out


def to_csv(per_scenario_rows: list[dict]) -> str:
    if not per_scenario_rows:
        return ""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(per_scenario_rows[0].keys()))
    writer.writeheader()
    writer.writerows(per_scenario_rows)
    return buf.getvalue()


def run_full_benchmark(seeds=(0, 1, 2), save_to_db=True):
    return run(seeds=seeds, scenarios=list(S.SPECS), save_to_db=save_to_db)


if __name__ == "__main__":
    out = run_full_benchmark(save_to_db=False)
    json.dump(out, sys.stdout, indent=2)
