# IncidentIQ Evaluation & Benchmark Methodology

## 1. Evaluation Methodology

The IncidentIQ benchmark measures root-cause identification and remediation recommendation performance under controlled, reproducible conditions.

### Non-Negotiable Invariants:
1. **Sacred Ground-Truth Isolation**: The scenario generator is the sole module possessing ground truth. Observables are emitted cleanly to the diagnostic agent without hidden labels, expected actions, or hints.
2. **Post-Hoc Evaluation**: Predictions are fully finalized before the evaluator accesses ground truth.
3. **No Paid API Dependency**: Full evaluation runs deterministically without network access or API keys.

---

## 2. Benchmark Scenarios & Ground Truth Mappings

The benchmark contains 8 synthetic scenarios across multiple deterministic seeds:

| Scenario Key | True Root Cause Category | Target Service | Expected Action | Distractor / Decoy Signals |
|---|---|---|---|---|
| `db_pool` | `db_connection_pool_exhaustion` | checkout-service | `increase_pool_size` | Unrelated email worker retry WARNs |
| `bad_deploy` | `bad_deployment` | checkout-service | `rollback_deployment` | Co-occurring cache metric fluctuations |
| `redis_latency` | `redis_latency` | checkout-service | `clear_cache` | Normal DB pool health probes |
| `memory_leak` | `memory_leak` | inventory-service | `restart_service` | Benign notification queue lag |
| `payment_outage` | `payment_provider_failure` | payment-service | `enable_circuit_breaker` | Normal catalog response latencies |
| `queue_backlog` | `queue_backlog` | notification-service | `scale_service` | Worker thread allocations |
| `cpu_saturation` | `cpu_saturation` | api-gateway | `scale_service` | **Misleading ERROR logs** matching `HTTP 500` & `pool` |
| `network_timeout` | `network_timeout` | payment-service | `enable_circuit_breaker` | **Misleading ERROR logs** matching `consumer lag` |

> [!NOTE]
> Scenarios `cpu_saturation` and `network_timeout` contain misleading error bursts specifically designed to fool naive log keyword matching. Naive regex matching misdiagnoses these scenarios, whereas multi-source corroboration correctly identifies the root cause.

---

## 3. Metric Mathematical Definitions

- **Top-1 Accuracy**: Fraction of trials where the highest-ranked hypothesis matches the ground truth cause:
  $$\text{Top-1} = \frac{1}{N} \sum_{i=1}^N \mathbb{I}(\hat{c}_i^{(1)} = c_i^*)$$
- **Top-k Recall**: Fraction of trials where the ground truth cause appears in the top $k$ ranked hypotheses ($k=3$):
  $$\text{Top-k} = \frac{1}{N} \sum_{i=1}^N \mathbb{I}(c_i^* \in \{\hat{c}_i^{(1)}, \dots, \hat{c}_i^{(k)}\})$$
- **Naive Baseline Top-1**: Accuracy achieved by a naive regex keyword count on error logs (no metric corroboration or causal ordering).
- **Evidence Precision**: Fraction of evidence items cited by the top hypothesis that belong to the required ground truth evidence set:
  $$\text{Precision} = \frac{|\mathcal{E}_{\text{cited}} \cap \mathcal{E}_{\text{required}}|}{|\mathcal{E}_{\text{cited}}|}$$
- **Evidence Recall**: Fraction of required ground truth evidence items that were cited by the top hypothesis:
  $$\text{Recall} = \frac{|\mathcal{E}_{\text{cited}} \cap \mathcal{E}_{\text{required}}|}{|\mathcal{E}_{\text{required}}|}$$
- **Unsupported Claim Rate**: Fraction of trials where the agent claimed an evidence ID not present in the observable telemetry. Must strictly be 0.0%.
- **Remediation Accuracy**: Fraction of completed investigations recommending the exact playbook remediation action.
- **Verification Success**: Fraction of proposed actions verified as `recovered` on the infrastructure simulator.

---

## 4. Measured Benchmark Results

Measured across 24 evaluations (8 scenarios $\times$ 3 seeds: 0, 1, 2):

| Metric | Deterministic Rules Engine | Naive Keyword Baseline |
|---|---|---|
| **Top-1 Accuracy** | **100.0%** (24/24) | **87.5%** (21/24) |
| **Top-k Recall** | **100.0%** (24/24) | **87.5%** (21/24) |
| **Evidence Precision** | **64.6%** | N/A (Baseline does not cite IDs) |
| **Evidence Recall** | **62.5%** | N/A |
| **Unsupported Claim Rate** | **0.0%** | N/A |
| **Remediation Accuracy** | **100.0%** | N/A |
| **Verification Recovery** | **100.0%** | N/A |
| **Mean Latency** | **~0.17 ms** | ~0.08 ms |

### Scientific Limitations
- **Synthetic Templates**: The benchmark relies on synthetic telemetry generator templates.
- **Small Sample Size ($N=24$)**: Useful for regression testing and causal corroboration verification, but does not prove zero-shot open-domain generalization.

