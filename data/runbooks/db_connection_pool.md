# Runbook: Database Connection Pool Exhaustion

## Affected Services
- checkout-service
- postgres-primary

## Symptoms and Indicators
- Application logs showing `timeout waiting for connection from pool` or `too many connections: pool exhausted`.
- Metric `db_pool_usage_pct` spiking above 90%.
- Elevated p99 latency on dependent checkout endpoints (`latency_p99_ms` > 2000ms).

## Root Cause Analysis
High concurrent checkout load or leaked database connections holding open sessions until the Hikari/SQL pool is completely starved.

## Remediation Protocol
1. Execute `increase_pool_size` with parameters `{"pool_size": 100}` (or appropriate limit within max allowable 500 connections).
2. Validate PostgreSQL connection limit on `postgres-primary`.
3. Check for slow locking transactions on the database cluster.

## Verification
- Verify `db_pool_usage_pct` drops below 70%.
- Confirm latency returns to baseline (< 300ms).

