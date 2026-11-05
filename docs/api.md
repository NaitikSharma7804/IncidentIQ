# IncidentIQ API Reference (/api/v1)

## Base URL
`/api/v1`

## Authentication
JWT Bearer Token required on all protected endpoints.
Pass via header: `Authorization: Bearer <token>`

---

## 1. Authentication Endpoints

### `POST /api/v1/auth/login`
- **Rate Limit**: 100/minute
- **Request Body**:
  ```json
  { "username": "demo-engineer", "password": "demo-only" }
  ```
- **Response**:
  ```json
  { "access_token": "<jwt>", "token_type": "bearer", "role": "engineer", "username": "demo-engineer" }
  ```

### `GET /api/v1/auth/me`
- **Requires**: Any authenticated role.
- **Response**: User profile with authoritative role read from database.

---

## 2. Incident Endpoints

### `GET /api/v1/incidents`
- **Query Params**: `status`, `severity`, `service`, `search`, `limit` (default 20), `offset` (default 0).
- **Requires**: `viewer` or higher.

### `POST /api/v1/incidents`
- **Requires**: `engineer`, `incident_commander`, `admin`.
- **Request Body**: `{ "title": "...", "service": "...", "severity": "high" }`

### `POST /api/v1/incidents/synthetic`
- **Requires**: `engineer`, `incident_commander`, `admin`.
- **Request Body**: `{ "scenario": "db_pool", "seed": 0 }`

### `GET /api/v1/incidents/{iid}`
- **Requires**: `viewer` or higher.

### `PATCH /api/v1/incidents/{iid}`
- **Requires**: `engineer`, `incident_commander`, `admin`.
- **Valid Transitions**:
  - `open` -> `investigating`, `resolved`, `closed`
  - `investigating` -> `remediating`, `resolved`, `closed`, `open`
  - `remediating` -> `resolved`, `investigating`, `closed`
  - `resolved` -> `closed`, `open`
  - `closed` -> `open`

### `GET /api/v1/incidents/{iid}/telemetry`
- **Query Params**: `source_type` (`log`, `metric`, `deployment`).
- **Requires**: `viewer` or higher.

---

## 3. Investigation Endpoints

### `POST /api/v1/incidents/{iid}/investigate`
- **Rate Limit**: 20/minute
- **Requires**: `engineer`, `incident_commander`, `admin`.
- **Request Body**:
  ```json
  { "mode": "deterministic_rules" }
  ```
  Modes: `deterministic_rules`, `retrieval_assisted`, `llm_assisted`.
- **Response**: Investigation report with stages, ranked hypotheses, supporting/contradicting evidence IDs, and proposed remediation.

### `GET /api/v1/investigations`
- **Query Params**: `incident_id`, `limit`, `offset`.

### `GET /api/v1/investigations/{inv_id}`
- Returns full investigation report and stage performance breakdowns.

---

## 4. Remediation Endpoints

### `GET /api/v1/incidents/{iid}/remediations`
- Lists all proposed and executed remediations for an incident.

### `POST /api/v1/incidents/{iid}/remediations/{rid}/approve`
- **Requires**: `incident_commander` or `admin`.
- **Constraint**: Separation of duties enforces that an actor cannot approve their own high-risk proposal.

### `POST /api/v1/incidents/{iid}/remediations/{rid}/reject`
- **Requires**: `incident_commander` or `admin`.

### `POST /api/v1/incidents/{iid}/remediations/{rid}/execute`
- **Requires**: `engineer`, `incident_commander`, `admin`.
- **Constraint**: Approval must be `approved` or `not_required` (low risk). Idempotent: repeated calls do not duplicate actions.

### `POST /api/v1/incidents/{iid}/remediations/{rid}/verify`
- **Requires**: `engineer`, `incident_commander`, `admin`.
- Executes post-action verification test on simulated infrastructure.

---

## 5. Knowledge (RAG) & Evaluation Endpoints

### `GET /api/v1/knowledge`
- Search or browse runbooks and architecture docs.

### `POST /api/v1/knowledge/ingest`
- **Requires**: `admin`. Idempotently chunks and embeds runbooks.

### `POST /api/v1/evaluations/run`
- **Requires**: `admin`. Runs full post-hoc benchmark comparison.

### `GET /api/v1/system/info`
- Returns environment mode, active vector backend, database status, server time.

