"""
Cognee ECL (Extract-Cognify-Load) Engine Wrapper
Handles ingestion, custom directive prompting, and hybrid GraphRAG retrieval.
"""

import os
import sys
import asyncio
from typing import Optional, List, Any

# Ensure config environment is applied before cognee initialization
from config import CONFIG
import cognee
from cognee import SearchType

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
        using custom_prompt, and loads nodes & edges into Neo4j and vector index.
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
        search_type: SearchType = SearchType.GRAPH_COMPLETION,
    ):
        """
        Query Stage: Executes hybrid graph-vector search over cognitive memory.
        """
        ds = dataset_name or self.default_dataset
        print(f"[CognitiveEngine] Querying memory: '{query}' (Type: {search_type})...")
        try:
            results = await cognee.search(
                query_text=query,
                dataset_name=ds,
                search_type=search_type
            )
            return {
                "success": True,
                "query": query,
                "dataset": ds,
                "results": results
            }
        except Exception as e:
            return {
                "success": False,
                "query": query,
                "error": str(e)
            }

    async def reset(self):
        """Wipes cognitive memory state for clean testing."""
        print("[CognitiveEngine] Resetting memory state...")
        await cognee.prune.prune_data()
        return {"status": "pruned"}

cognitive_engine = CognitiveEngine()
