# IncidentIQ Security Architecture & Threat Model

## 1. Security Principles

Security decisions in IncidentIQ are strictly deterministic and implemented in server code:
1. **Server-Authoritative RBAC**: User roles are read directly from the database record during every request. Claims present in client JWT tokens are never trusted for authorization.
2. **Argon2 Password Hashing**: Passwords are saved with salted Argon2id hashes via `argon2-cffi`. Legacy SHA-256 demo hashing has been fully replaced.
3. **Separation of Duties**: High-risk remediation proposals (e.g. rollback deployment) cannot be approved by the requester. A distinct Incident Commander or Admin must authorize.
4. **Action & Payload Integrity**: Approval records link to the SHA-256 hash of the exact action parameters. Reusing an approval for a modified action payload is cryptographically prevented.
5. **Idempotent Execution**: Repeated calls to `/execute` return the existing status without triggering duplicate actions.
6. **No Secret Leakage**: Passwords, tokens, API keys, and internal database stack traces are sanitized from all logs and API responses.

---

## 2. Role-Based Access Control (RBAC) Matrix

| Operation | Viewer | Engineer | Incident Commander | Admin |
|---|:---:|:---:|:---:|:---:|
| `GET /api/v1/incidents` | Yes | Yes | Yes | Yes |
| `POST /api/v1/incidents` | No | Yes | Yes | Yes |
| `POST /api/v1/incidents/synthetic` | No | Yes | Yes | Yes |
| `POST /api/v1/incidents/{id}/investigate` | No | Yes | Yes | Yes |
| `POST /api/v1/.../remediations/{id}/approve` | No | No | Yes* | Yes* |
| `POST /api/v1/.../remediations/{id}/reject` | No | No | Yes | Yes |
| `POST /api/v1/.../remediations/{id}/execute` | No | Yes | Yes | Yes |
| `POST /api/v1/.../remediations/{id}/verify` | No | Yes | Yes | Yes |
| `POST /api/v1/evaluations/run` | No | No | No | Yes |
| `POST /api/v1/knowledge/ingest` | No | No | No | Yes |
| `GET /api/v1/audit` | No | No | No | Yes |

*\* Subject to separation of duties on high-risk actions (cannot approve own proposal).*

---

## 3. Persistent Security Audit Logging

All security-sensitive operations are persisted in the `audit_events` database table:
- **Authentication**: Successful and failed login attempts (with actor IP and reason).
- **Proposals**: Remediation proposals with action name, service, and computed risk.
- **Approvals & Rejections**: Actor, role, decision, and payload hash.
- **Executions**: Execution timestamp and executor ID.
- **Access Denials**: Unauthorized role, missing approval, and self-approval attempts.

