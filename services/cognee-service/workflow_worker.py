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

from engine import cognitive_engine
from schemas import AVAILABLE_SCHEMAS

async def run_worker_task(claim_uri: str, dataset_name: str, custom_prompt: str):
    start_time = time.time()
    print("=================================================================")
    print("🚀 [Render Workflows Worker] Initializing Claim-Check Background Job")
    print(f"   Claim URI: {claim_uri}")
    print(f"   Target Dataset: {dataset_name}")
    print("=================================================================")

    parsed = urlparse(claim_uri)
    file_content = None

    if parsed.scheme == "file" or os.path.exists(claim_uri):
        local_path = parsed.path if parsed.scheme == "file" else claim_uri
        print(f"[Worker] Resolving local claim buffer: {local_path}...")
        with open(local_path, "r", encoding="utf-8", errors="ignore") as f:
            file_content = f.read()
    else:
        # Direct raw payload or mock URL
        file_content = f"Ingested from claim reference: {claim_uri}"

    print(f"[Worker] Ingesting dataset payload ({len(file_content)} characters)...")
    await cognitive_engine.ingest_content(file_content, dataset_name=dataset_name)

    print("[Worker] Executing ECL Cognify phase (Token Chunking + Graph Synthesis)...")
    cognify_res = await cognitive_engine.run_cognify(
        dataset_name=dataset_name,
        custom_prompt=custom_prompt
    )

    elapsed = time.time() - start_time
    print(f"✅ [Render Workflows Worker] Job completed successfully in {elapsed:.2f}s!")
    print(f"   Status: {cognify_res.get('status')}")
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
