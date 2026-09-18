"""
Centralized logging setup for the Cognee cognitive microservice.
- Every log line carries: timestamp, level, logger name, request_id, message.
- request_id comes from the X-Request-Id header set by the Node backend, so one
  request can be traced end-to-end across both services.
- Output goes to stdout (Render captures it) AND services/cognee-service/logs/cognee-service.log
"""

import contextvars
import logging
import logging.handlers
import os
import sys

request_id_var = contextvars.ContextVar("request_id", default="-")


class RequestIdFilter(logging.Filter):
    def filter(self, record):
        record.request_id = request_id_var.get()
        return True


def setup_logging(service: str = "cognee-service", level: str = None):
    """
    Idempotent-safe to call multiple times — always re-applies our handlers.
    This matters because `import cognee` reconfigures root logging (colored
    stdout only, no file, no request ids), so we re-apply AFTER that import.
    """
    resolved_level = (level or os.environ.get("LOG_LEVEL", "DEBUG")).upper()
    log_dir = os.path.join(os.path.dirname(__file__), "logs")
    os.makedirs(log_dir, exist_ok=True)

    root = logging.getLogger()
    root.setLevel(resolved_level)
    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)-5s] [%(request_id)s] [%(name)s] %(message)s"
    )

    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(formatter)
    stdout_handler.addFilter(RequestIdFilter())

    file_handler = logging.handlers.RotatingFileHandler(
        os.path.join(log_dir, "cognee-service.log"),
        maxBytes=5_000_000,
        backupCount=2,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    file_handler.addFilter(RequestIdFilter())

    root.handlers = [stdout_handler, file_handler]
    return logging.getLogger(service)
