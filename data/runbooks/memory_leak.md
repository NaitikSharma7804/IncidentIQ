# Runbook: Memory Leak and Container OOMKilled

## Affected Services
- inventory-service

## Symptoms and Indicators
- Process logs reporting `GC overhead limit exceeded` or container termination `container OOMKilled (out of memory)`.
- Metric `memory_pct` exceeding 90% (climbing steadily towards 100%).

## Root Cause Analysis
Unbounded object retention, unclosed stream handles, or inefficient cache growth in heap memory.

## Remediation Protocol
1. Medium-risk operational action: requires approval from Incident Commander or Admin.
2. Execute `restart_service` with parameter `{"graceful": true}` on `inventory-service`.
3. Capture heap dump before restart if diagnostic dump hook is enabled.

## Verification
- Verify `memory_pct` resets to baseline (typically 35-45%).
- Ensure pod remains in `Running` status without crash loops.

