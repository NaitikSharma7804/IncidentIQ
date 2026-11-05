# Runbook: Queue Backlog and High Consumer Lag

## Affected Services
- notification-service

## Symptoms and Indicators
- Logs indicating `queue backlog growing, consumer lag 5400` or `consumer lag exceeds threshold`.
- Metric `queue_depth` exceeding 1000 items (frequently 5000-10000).

## Root Cause Analysis
Producer ingestion rate outpaces consumer processing throughput, or slow downstream notification dispatch locks consumer workers.

## Remediation Protocol
1. Execute `scale_service` with parameter `{"replicas": 6}` (or up to allowed 20 replicas).
2. Monitor consumer group rebalancing and message partition assignment.

## Verification
- Confirm `queue_depth` steadily diminishes toward baseline (< 50).
- Confirm notification delivery latency recovers within SLA.

