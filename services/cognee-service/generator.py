"""
Dynamic Problem Statement Schema Formulator
Uses NVIDIA NIM Nemotron (or offline template heuristic) to dynamically
synthesize domain-tailored Pydantic v2 DataPoint schemas from any hackathon prompt.
Rotates through the 5-key pool with a 45s per-key timeout before falling back.
"""

import os
import re
import logging
import requests
from dotenv import load_dotenv

from logging_setup import setup_logging

load_dotenv()

logger = setup_logging("schema-generator")

NVIDIA_KEYS = [
    os.getenv("NVIDIA_API_KEY_1", "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"),
    os.getenv("NVIDIA_API_KEY_2", "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"),
    os.getenv("NVIDIA_API_KEY_3", "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"),
    os.getenv("NVIDIA_API_KEY_4", "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"),
    os.getenv("NVIDIA_API_KEY_5", "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"),
]

# Nemotron is a reasoning model — give it room to finish (backend aiService.js uses 45s too).
REQUEST_TIMEOUT_SECONDS = 45


def generate_schema_for_problem_statement(problem_statement: str):
    """
    Analyzes the problem statement and returns tailored Pydantic schema definitions
    compatible with Cognee DataPoint and SkipValidation.
    """
    prompt = f"""You are an enterprise knowledge graph architect.
Given the following hackathon problem statement, generate 2-3 custom Pydantic v2 DataPoint classes for Cognee.
Ensure each class:
1. Inherits from DataPoint.
2. Uses SkipValidation[Any] = None for any foreign node/edge references.
3. Defines metadata: MetaData = {{"index_fields": [...]}} for semantic search.

Problem Statement:
\"\"\"{problem_statement}\"\"\"

Respond with only clean Python code snippet containing the classes.
"""

    payload = {
        "model": "nvidia/nemotron-3.5-lightning-30b-a3b",
        "messages": [
            {
                "role": "system",
                "content": "You are an expert Cognee graph ontology engineer. Output only valid Python Pydantic classes.",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 1024,
    }

    last_error = None
    for index, api_key in enumerate(NVIDIA_KEYS):
        if not api_key:
            continue
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }
        try:
            resp = requests.post(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            if resp.status_code == 200:
                logger.info("Schema generated via NVIDIA key #%s", index + 1)
                content = resp.json()["choices"][0]["message"]["content"]
                # Extract code block if present
                code_match = re.search(r"```python(.*?)```", content, re.DOTALL)
                code = code_match.group(1).strip() if code_match else content.strip()
                return {
                    "success": True,
                    "generated_code": code,
                    "source": "nvidia/nemotron-3.5-lightning-30b-a3b",
                    "key_index": index + 1,
                }
            last_error = f"key #{index + 1} returned HTTP {resp.status_code}"
            logger.warning("Schema generation key failed — rotating | %s", last_error)
        except Exception as e:
            last_error = f"key #{index + 1} failed ({e})"
            logger.warning("Schema generation key failed — rotating | %s", last_error)

    logger.error("All schema generation keys exhausted (%s) — using deterministic fallback", last_error)

    # Deterministic Heuristic Fallback
    fallback_code = f'''from typing import Any, Optional
from pydantic import SkipValidation
from cognee.infrastructure.engine import DataPoint
from cognee.infrastructure.engine.models.DataPoint import MetaData

class DomainCoreEntity(DataPoint):
    entity_id: str
    name: str
    primary_attribute: str
    connected_to: SkipValidation[Any] = None
    metadata: MetaData = {{"index_fields": ["name", "primary_attribute"]}}

class ProblemActionItem(DataPoint):
    action_id: str
    objective: str
    priority: str = "HIGH"
    target_entity: SkipValidation[Any] = None
    metadata: MetaData = {{"index_fields": ["action_id", "objective"]}}
'''
    return {
        "success": True,
        "generated_code": fallback_code,
        "source": "deterministic_fallback",
    }


if __name__ == "__main__":
    sample_ps = "Build an autonomous AI agent to trace fraudulent offshore shell company networks and flag high-risk transactions across jurisdictions."
    res = generate_schema_for_problem_statement(sample_ps)
    print("=== Generated Schemas ===")
    print(res["generated_code"])
