# Runbook: Faulty Deployment / Application Regression

## Affected Services
- checkout-service

## Symptoms and Indicators
- Surge in `HTTP 500 unhandled exception in OrderSerializer` or `NullPointer in order serialization`.
- Metric `error_rate_pct` jumping above 5% (typically 30-40%).
- Recent deployment event recorded within the last 15-30 minutes prior to anomaly onset.

## Root Cause Analysis
A newly deployed service revision introduced a regression, unhandled exception, or schema incompatibility in order payload serialization.

## Remediation Protocol
1. High-risk operational action: requires Incident Commander or Admin approval.
2. Execute `rollback_deployment` specifying the bad `deployment_id`.
3. Halt subsequent CI/CD promotion pipelines.

## Verification
- Verify `error_rate_pct` drops to < 1.5%.
- Confirm subsequent synthetic test orders complete with HTTP 200.

