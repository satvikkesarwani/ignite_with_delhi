"""
Cognee ECL (Extract-Cognify-Load) Engine Wrapper
Handles ingestion, custom directive prompting, and hybrid GraphRAG retrieval.
Every stage is timed and logged so pipeline stalls/failures are immediately visible.
"""

from typing import Any, Optional, List
import time

from config import CONFIG
import logging

from logging_setup import setup_logging

import cognee
from cognee import SearchType

# cognee reconfigures root logging on import (colored stdout, no file) —
# re-apply our handlers so every log carries request ids and hits the file.
logger = setup_logging("cognee-engine")


def _normalize_results(results: List[Any]) -> List[Any]:
    """
    Cognee search returns plain strings or SearchResult objects depending on
    query_type. Normalize everything into JSON-serializable values.
    """
    clean = []
    for item in results or []:
        if isinstance(item, str):
            clean.append(item)
            continue
        try:
            clean.append(item.model_dump())
        except AttributeError:
            clean.append(str(item))
    return clean


class CognitiveEngine:
    def __init__(self):
        self.default_dataset = "hackathon_domain_memory"

    async def ingest_content(self, data: Any, dataset_name: Optional[str] = None):
        """
        Extract Stage: Ingests text, file path, or raw document into Cognee.
        """
        ds = dataset_name or self.default_dataset
        logger.info("Extract stage -> | dataset=%s content_chars=%s", ds, len(str(data)))
        started = time.time()
        await cognee.add(data, dataset_name=ds)
        logger.info("Extract stage <- | dataset=%s duration=%.2fs", ds, time.time() - started)
        return {"status": "ingested", "dataset": ds}

    async def run_cognify(
        self,
        dataset_name: Optional[str] = None,
        custom_prompt: Optional[str] = None,
    ):
        """
        Cognify & Load Stage: Splits text by token count, steers LLM extraction
        using custom_prompt, and loads nodes & edges into the graph and vector index.
        """
        ds = dataset_name or self.default_dataset
        prompt = custom_prompt or (
            "Extract all domain entities, financial accounts, organizations, directors, "
            "and risk associations. Ignore conversational noise and irrelevant text."
        )
        logger.info(
            "Cognify+Load stage -> | dataset=%s prompt=%r", ds, prompt[:120]
        )
        started = time.time()
        try:
            # study.md §5: explicit forensic chunk size — cognee's chunk_size=None
            # auto-calculates from LLM context and IGNORES our CHUNK_SIZE env, so
            # pass it through directly.
            chunk_size = int(CONFIG.get("CHUNK_SIZE", "500") or 500)
            await cognee.cognify(
                datasets=[ds],
                custom_prompt=prompt,
                chunk_size=chunk_size,
            )
            logger.info(
                "Cognify+Load stage <- | dataset=%s chunk_size=%s duration=%.2fs",
                ds,
                chunk_size,
                time.time() - started,
            )
            return {"status": "cognified", "dataset": ds, "prompt": prompt, "duration_seconds": round(time.time() - started, 2)}
        except Exception as e:
            logger.exception("Cognify+Load stage FAILED | dataset=%s duration=%.2fs", ds, time.time() - started)
            return {"status": "error", "message": str(e), "dataset": ds}

    async def search_memory(
        self,
        query: str,
        dataset_name: Optional[str] = None,
        search_type: Any = SearchType.GRAPH_COMPLETION,
    ):
        """
        Query Stage: Executes hybrid graph-vector search over cognitive memory.

        cognee >= 1.5 expects `query_type` (not `search_type`) and `datasets` (a list,
        not `dataset_name`) — both are mapped here so plain strings are accepted too.
        """
        ds = dataset_name or self.default_dataset
        if isinstance(search_type, str):
            query_type = SearchType(search_type)
        else:
            query_type = search_type or SearchType.GRAPH_COMPLETION

        logger.info("Search stage -> | dataset=%s query_type=%s query=%r", ds, query_type.value, query[:120])
        started = time.time()
        try:
            results = await cognee.search(
                query_text=query,
                query_type=query_type,
                datasets=[ds],
                # Retrieve raw graph context only — skip cognee's internal LLM answer
                # generation (the Node bridge synthesizes with Nemotron itself, so
                # doing it twice just doubles the latency).
                only_context=True,
            )
            normalized = _normalize_results(results)
            logger.info(
                "Search stage <- | dataset=%s result_count=%s duration=%.2fs",
                ds,
                len(normalized),
                time.time() - started,
            )
            return {
                "success": True,
                "query": query,
                "dataset": ds,
                "results": normalized,
            }
        except Exception as e:
            logger.exception(
                "Search stage FAILED | dataset=%s duration=%.2fs", ds, time.time() - started
            )
            return {
                "success": False,
                "query": query,
                "error": str(e),
            }

    async def reset(self):
        """Wipes cognitive memory state for clean testing."""
        logger.info("Resetting cognitive memory state")
        await cognee.prune.prune_data()
        return {"status": "pruned"}


cognitive_engine = CognitiveEngine()
