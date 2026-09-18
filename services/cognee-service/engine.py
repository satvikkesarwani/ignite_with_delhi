"""
Cognee ECL (Extract-Cognify-Load) Engine Wrapper
Handles ingestion, custom directive prompting, and hybrid GraphRAG retrieval.
"""

from typing import Any, Optional, List

# Ensure config environment is applied before cognee initialization
from config import CONFIG
import cognee
from cognee import SearchType


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
        print(f"[CognitiveEngine] Ingesting content into dataset: '{ds}'...")
        await cognee.add(data, dataset_name=ds)
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
        print(f"[CognitiveEngine] Running Cognify on dataset '{ds}' with directive prompt...")

        # Run cognify
        try:
            await cognee.cognify(datasets=[ds], custom_prompt=prompt)
            print(f"[CognitiveEngine] ✅ Cognify complete for dataset '{ds}'.")
            return {"status": "cognified", "dataset": ds, "prompt": prompt}
        except Exception as e:
            print(f"[CognitiveEngine] ⚠️ Cognify encountered: {e}")
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

        print(f"[CognitiveEngine] Querying memory: '{query}' (Type: {query_type.value})...")
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
            return {
                "success": True,
                "query": query,
                "dataset": ds,
                "results": _normalize_results(results),
            }
        except Exception as e:
            return {
                "success": False,
                "query": query,
                "error": str(e),
            }

    async def reset(self):
        """Wipes cognitive memory state for clean testing."""
        print("[CognitiveEngine] Resetting memory state...")
        await cognee.prune.prune_data()
        return {"status": "pruned"}


cognitive_engine = CognitiveEngine()
