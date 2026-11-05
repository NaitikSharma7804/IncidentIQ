# Runbook: API Gateway CPU Saturation and Throttling

## Affected Services
- api-gateway

## Symptoms and Indicators
- Logs warning `CPU throttling high, worker pool saturated` or `thread starvation, latency spike`.
- Metric `cpu_pct` exceeding 85% (surging to 98-100%).

## Root Cause Analysis
Traffic spike, complex SSL termination overhead, or inefficient request parsing consuming all available CPU shares.

## Remediation Protocol
1. Execute `scale_service` on `api-gateway` with parameter `{"replicas": 8}`.
2. In emergency overload, enable rate limiting at load balancer ingress.

## Verification
- Confirm aggregate `cpu_pct` drops below 70%.
- Ensure request queue latency falls back below 50ms.

