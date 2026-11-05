"""Structured JSON logging with sensitive data redaction.
Never logs ground truth, credentials, or private simulator state.
"""
import json
import logging
import re
import sys
from datetime import UTC, datetime
from typing import Any

REDACT_KEYS = {"password", "pw", "token", "access_token", "secret", "authorization", "api_key", "credentials"}
REDACT_PATTERNS = [
    re.compile(r"Bearer\s+([A-Za-z0-9\-._~+/]+=*)", re.IGNORECASE),
    re.compile(r'"password":\s*"[^"]+"', re.IGNORECASE),
]


def redact_data(obj: Any) -> Any:
    if isinstance(obj, dict):
        redacted = {}
        for k, v in obj.items():
            if any(rk in k.lower() for rk in REDACT_KEYS):
                redacted[k] = "[REDACTED]"
            else:
                redacted[k] = redact_data(v)
        return redacted
    elif isinstance(obj, list):
        return [redact_data(item) for item in obj]
    elif isinstance(obj, str):
        cleaned = obj
        for pat in REDACT_PATTERNS:
            cleaned = pat.sub("[REDACTED]", cleaned)
        return cleaned
    return obj


class StructuredJsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        record_dict: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "module": record.module,
            "message": record.getMessage(),
        }

        # Extra structured attributes
        for attr in ("correlation_id", "request_id", "incident_id", "investigation_id", "stage", "duration_ms", "error_category"):
            val = getattr(record, attr, None)
            if val is not None:
                record_dict[attr] = val

        if record.exc_info:
            record_dict["exception"] = self.formatException(record.exc_info)

        return json.dumps(redact_data(record_dict))


def setup_logger(name: str = "incidentiq") -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(StructuredJsonFormatter())
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    return logger


logger = setup_logger()
