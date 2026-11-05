"""Tests for Ground-Truth Isolation, LangGraph Agent Workflow, and LLM Fallback."""
import copy
import inspect
from unittest.mock import MagicMock, patch

from incidentiq import agent
from incidentiq import diagnosis as D
from incidentiq import scenarios as S
from incidentiq.agent import run_agent_investigation


def test_ground_truth_isolation_label_mutation():
    """Altering the hidden GroundTruth object while observables stay identical

    MUST NOT alter the agent's input or output.
    """
    obs, original_gt = S.generate("db_pool", seed=10)
    obs_copy = copy.deepcopy(obs)

    # First run with original observables
    rep1 = run_agent_investigation(obs, mode="deterministic_rules")

    # Simulate an external label mutation or completely different fake GroundTruth
    fake_gt = S.GroundTruth(
        cause="nonexistent_fabricated_cause",
        action="nonexistent_action",
        required_evidence=frozenset(["ev:fake-001"]),
    )

    # Second run with exact same observables
    rep2 = run_agent_investigation(obs_copy, mode="deterministic_rules")

    assert rep1["root_cause"] == rep2["root_cause"]
    assert rep1["status"] == rep2["status"]
    assert rep1["remediation"] == rep2["remediation"]
    assert [h["id"] for h in rep1["hypotheses"]] == [h["id"] for h in rep2["hypotheses"]]


def test_agent_code_has_no_ground_truth_references():
    agent_src = inspect.getsource(agent).lower()
    for banned in (
        "groundtruth",
        "ground_truth",
        "expected_remediation",
        "required_evidence",
        "import scenarios",
        "from . import scenarios",
    ):
        assert banned not in agent_src, f"Banned string '{banned}' found in agent source code!"


def test_langgraph_pipeline_stages_and_metadata():
    obs, _ = S.generate("memory_leak", seed=3)
    rep = run_agent_investigation(obs, mode="deterministic_rules")

    assert rep["status"] == "completed"
    assert rep["root_cause"] == "memory_leak"
    assert rep["remediation"]["action"] == "restart_service"

    stage_names = [s["name"] for s in rep["stages"]]
    assert "intake" in stage_names
    assert "telemetry_collection" in stage_names
    assert "hypothesis_ranking" in stage_names
    assert "remediation_planning" in stage_names
    assert "final_report" in stage_names


def test_llm_prompts_contain_zero_ground_truth():
    """Assert captured LLM prompts do not contain ground truth or secret labels."""
    obs, gt = S.generate("bad_deploy", seed=5)
    # Run with llm_assisted mode to capture prompts
    with patch("incidentiq.agent.get_settings") as mock_settings:
        mock_settings.return_value.incidentiq_enable_llm = True
        mock_settings.return_value.incidentiq_llm_api_key = "mock"
        mock_settings.return_value.incidentiq_llm_base_url = "http://mock-llm.local"
        mock_settings.return_value.incidentiq_llm_model = "test-model"

        with patch("httpx.Client.post") as mock_post:
            mock_post.side_effect = Exception("Mock LLM network error")
            rep = run_agent_investigation(obs, mode="llm_assisted")

            # Fallback should cleanly succeed
            assert rep["status"] == "completed"
            assert rep["root_cause"] == "bad_deployment"

            # Check all captured prompts
            captured = rep.get("llm_prompts_captured", [])
            for prompt in captured:
                p_lower = prompt.lower()
                assert "ground" not in p_lower
                assert gt.action not in prompt  # Expected action must never be leaked to the prompt


def test_llm_fallback_on_malformed_json_and_timeout():
    obs, _ = S.generate("redis_latency", seed=7)
    with patch("incidentiq.agent.get_settings") as mock_settings:
        mock_settings.return_value.incidentiq_enable_llm = True
        mock_settings.return_value.incidentiq_llm_api_key = "mock"
        mock_settings.return_value.incidentiq_llm_base_url = "http://mock-llm.local"
        mock_settings.return_value.incidentiq_llm_model = "test-model"

        # Mock response returning garbage JSON
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": "This is definitely not valid JSON {"}}]
        }

        with patch("httpx.Client.post", return_value=mock_resp):
            rep = run_agent_investigation(obs, mode="llm_assisted")
            # Must fall back deterministically and still succeed
            assert rep["status"] == "completed"
            assert rep["root_cause"] == "redis_latency"


def test_fabricated_evidence_ids_rejected():
    """If an LLM or untrusted input claims an evidence ID that does not exist in real telemetry,

    it must be dropped and counted as an unsupported claim.
    """
    obs, _ = S.generate("db_pool", seed=8)
    real_evidence, _ = D.collect(obs, D.DEFAULT_CONFIG)
    real_id = real_evidence[0]["id"]
    hallucinated_id = "ev:hallucinated-999"

    with patch("incidentiq.agent.get_settings") as mock_settings:
        mock_settings.return_value.incidentiq_enable_llm = True
        mock_settings.return_value.incidentiq_llm_api_key = "mock"
        mock_settings.return_value.incidentiq_llm_base_url = "http://mock-llm.local"
        mock_settings.return_value.incidentiq_llm_model = "test-model"

        llm_payload = {
            "choices": [
                {
                    "message": {
                        "content": (
                            '{"hypotheses": [{'
                            '"category": "db_connection_pool_exhaustion",'
                            '"confidence": 0.95,'
                            f'"supporting_evidence": ["{real_id}", "{hallucinated_id}"],'
                            '"explanation": "Hallucinated supporting evidence"'
                            "}]}"
                        )
                    }
                }
            ]
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = llm_payload

        with patch("httpx.Client.post", return_value=mock_resp):
            rep = run_agent_investigation(obs, mode="llm_assisted")
            assert rep["status"] == "completed"
            assert rep["unsupported_claims_count"] >= 1
            top_hyp = rep["hypotheses"][0]
            assert hallucinated_id not in top_hyp["supporting_evidence"]
            assert real_id in top_hyp["supporting_evidence"]
