# IncidentIQ End-to-End Walkthrough & Demo Guide

This guide walks through a complete end-to-end incident lifecycle using the IncidentIQ web dashboard and API.

## Step 1: Start Backend and Frontend

### Terminal 1 — Backend:
```powershell
# Run migrations and seed database
python -m incidentiq.seed

# Start backend server
uvicorn incidentiq.api:app --host 0.0.0.0 --port 8000 --reload
```

### Terminal 2 — Frontend:
```powershell
cd frontend
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## Step 2: Login as Engineer
1. On the login page, click the quick-login button: **Engineer** (`demo-engineer` / `demo-only`).
2. You will land on the **Overview** dashboard showing real KPI cards, MTTR, severity distribution, and monitored service topology.

---

## Step 3: Generate a Synthetic Incident
1. Navigate to **Incident Explorer** in the left sidebar.
2. Click **Generate Synthetic Incident**.
3. Select scenario: **Faulty Deployment (OrderSerializer Error)** (`bad_deploy`) with Seed `42`.
4. Click **Inject Scenario**.
5. The incident `inc-...` appears at the top of the table.

---

## Step 4: Autonomous LangGraph Investigation
1. Click **Workspace** next to your new incident to open the Incident Details page.
2. Under "Diagnosis Engine", leave `Deterministic Rule-Based (Zero-Key Fallback)` selected (or try `Retrieval-Assisted`).
3. Click **Run Autonomous Diagnosis**.
4. Observe the LangGraph execution pipeline:
   - Intake & Validation
   - Telemetry Collection
   - Knowledge Retrieval (Runbooks)
   - Hypothesis Generation
   - Hypothesis Ranking & Contradiction Analysis
   - Remediation Planning
   - Final Report
5. The Root Cause Finding will authoritative identify:
   - Root Cause: `bad_deployment`
   - Confidence: Heuristic Score (~85%)
   - Recommended Action: `rollback_deployment` on `checkout-service` (Risk: **HIGH**).

---

## Step 5: Dual Approval & Separation of Duties
1. Click **Go to Remediation Center to Authorize**.
2. Notice the action is in status `proposed` with risk `high`.
3. Because you are logged in as `demo-engineer`, the **Approve** button is disabled (requires Incident Commander or Admin role).
4. If you log out and log in as the requester who proposed it, clicking Approve will be blocked by **Separation of Duties**.
5. Log out, then click **Commander** (`demo-incident_commander`).
6. Navigate back to **Remediation Center**, select the incident, and click **Approve**.
7. The status changes to `approved`.

---

## Step 6: Simulated Execution & Verification
1. Now that the proposal is approved, click **Execute Action**.
2. The action executes against the simulated infrastructure state machine and marks `status: executed`.
3. Click **Verify Infrastructure State**.
4. The system executes post-action verification and confirms:
   - **Verification Verdict: RECOVERED**.

---

## Step 7: Audit History & Evaluation Run
1. Switch to the **Security Audit Trail** tab in the Remediation Center.
2. Review the persistent, immutable audit log entries recording:
   - Login event
   - Investigation execution
   - Action proposal
   - Commander approval with payload SHA-256 hash
   - Execution and recovery verification
3. Navigate to **Evaluation Center** in the sidebar.
4. Click **Run Full Benchmark (8 Scenarios)** to execute the post-hoc evaluator across all synthetic scenarios and view comparative accuracy charts.

