# Runbook: Redis Cache Latency and Timeouts

## Affected Services
- checkout-service
- redis-cache

## Symptoms and Indicators
- Application logs reporting `redis GET timeout after 500ms` or `redis slow response, request timed out`.
- Metric `redis_latency_ms` exceeding threshold of 100ms (often 300-500ms).
- Cascading p99 latency spikes on `checkout-service`.

## Root Cause Analysis
Large key access, memory fragmentation, or blocked single-threaded Redis event loop causing query timeouts.

## Remediation Protocol
1. Low-risk operational action: does not require prior dual approval.
2. Execute `clear_cache` with target `{"cache": "redis-cache"}`.
3. If memory pressure persists, check Redis eviction policy and memory fragmentation ratio.

## Verification
- Verify `redis_latency_ms` falls back below 10ms.
- Confirm checkout p99 latency stabilizes under 300ms.

