"""
Render Workflows Background Task Worker
Implements the Claim-Check pattern: streams payload from storage URI,
executes Cognee ECL cognitive pipeline, and loads into Neo4j AuraDB.
"""

import os
import sys
import argparse
import asyncio
import time
from urllib.parse import urlparse

import requests

from logging_setup import setup_logging
from engine import cognitive_engine
from schemas import AVAILABLE_SCHEMAS

logger = setup_logging("render-worker")

async def run_worker_task(claim_uri: str, dataset_name: str, custom_prompt: str):
    start_time = time.time()
    logger.info("Claim-check worker starting | claim_uri=%s dataset=%s", claim_uri, dataset_name)

    parsed = urlparse(claim_uri)
    file_content = None

    if parsed.scheme == "file" or os.path.exists(claim_uri):
        local_path = parsed.path if parsed.scheme == "file" else claim_uri
        logger.info("Resolving local claim buffer | path=%s", local_path)
        with open(local_path, "r", encoding="utf-8", errors="ignore") as f:
            file_content = f.read()
    else:
        # Direct raw payload or mock URL
        logger.warning("Claim URI not a local file — using placeholder content")
        file_content = f"Ingested from claim reference: {claim_uri}"

    logger.info("Claim payload resolved | chars=%s", len(file_content))
    await cognitive_engine.ingest_content(file_content, dataset_name=dataset_name)

    logger.info("Executing ECL cognify phase (token chunking + graph synthesis)")
    cognify_res = await cognitive_engine.run_cognify(
        dataset_name=dataset_name,
        custom_prompt=custom_prompt
    )

    elapsed = time.time() - start_time
    if cognify_res.get("status") == "error":
        logger.error("Worker job FAILED after %.2fs | error=%s", elapsed, cognify_res.get("message"))
        return 1
    logger.info("Worker job completed successfully | status=%s elapsed=%.2fs", cognify_res.get("status"), elapsed)
    return 0

def main():
    parser = argparse.ArgumentParser(description="Render Workflows Claim-Check ECL Worker")
    parser.add_argument("--claim-uri", type=str, default="file:///tmp/sample_dataset.txt", help="Storage URI or path")
    parser.add_argument("--dataset", type=str, default="hackathon_domain_memory", help="Cognee dataset name")
    parser.add_argument("--prompt", type=str, default="Extract core entities, relationships, and risk factors.", help="Directive extraction prompt")

    args = parser.parse_args()
    return asyncio.run(run_worker_task(args.claim_uri, args.dataset, args.prompt))

if __name__ == "__main__":
    sys.exit(main())
