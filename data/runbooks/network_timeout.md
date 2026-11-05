# Runbook: Upstream Network Timeouts and Connection Failures

## Affected Services
- payment-service
- api-gateway

## Symptoms and Indicators
- Logs reporting `connect ETIMEDOUT 10.0.4.15:443` or `TCP connection refused on upstream socket`.
- Metric `connection_errors_pct` exceeding 20% (rising to 45-50%).

## Root Cause Analysis
Network interface packet drops, DNS resolution failure, security group configuration change, or upstream host unreachable.

## Remediation Protocol
1. Execute `enable_circuit_breaker` with parameter `{"provider": "upstream-gateway"}`.
2. Verify routing tables, VPC peering connections, and egress firewall rules.

## Verification
- Verify `connection_errors_pct` subsides to < 1%.
- Confirm network probe synthetic checks pass successfully.

