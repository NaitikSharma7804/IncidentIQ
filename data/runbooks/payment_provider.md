# Runbook: Third-Party Payment Provider Failure

## Affected Services
- payment-service

## Symptoms and Indicators
- Logs indicating `payment provider returned 503 unavailable` or `payment provider timeout on charge`.
- Metric `provider_error_rate_pct` exceeding 20% (often 70-90%).

## Root Cause Analysis
Upstream payment aggregator outage, merchant API throttling, or regional network partition.

## Remediation Protocol
1. Execute `enable_circuit_breaker` with parameter `{"provider": "payments"}`.
2. Route subsequent customer payments to secondary fallback gateway if configured.
3. Notify customer operations and monitor provider status dashboard.

## Verification
- Confirm error rate decreases as circuit breaker sheds upstream traffic.
- Verify fallback processing path returns expected queued or alternative status.

