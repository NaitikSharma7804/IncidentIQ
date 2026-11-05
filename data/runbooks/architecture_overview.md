# Architecture Overview: IncidentIQ Synthetic Platform

## Overview
IncidentIQ simulates a mission-critical e-commerce application topology comprising core services, databases, caches, and third-party integrations.

## Topology and Dependencies
- `api-gateway`: Edge ingress router. Routes incoming web requests to `checkout-service`, `payment-service`, `inventory-service`, and `notification-service`.
- `checkout-service`: Orchestrates order lifecycle. Depends directly on `postgres-primary`, `redis-cache`, `payment-service`, and `inventory-service`.
- `payment-service`: Integrates with external payment provider. Depends on `postgres-primary`.
- `inventory-service`: Manages SKU availability and warehouse reservations. Depends on `postgres-primary`.
- `notification-service`: Asynchronous transactional email/SMS dispatch. Depends on `postgres-primary`.
- `postgres-primary`: Master relational database for persistent operational records.
- `redis-cache`: Sub-millisecond distributed cache for session and inventory lookup acceleration.
- `email-worker`: Background queue consumer for batch email processing.

## Operational Safety and Remediation
All remediation actions are executed in simulated mode against the target environment. Every high-risk modification requires authenticated dual approval and separation of duties.

