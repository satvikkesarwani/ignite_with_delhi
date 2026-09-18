"""
Render Workflows pipeline definition (study.md §7-§8).

The full Cognee ECL pipeline as durable, distributed tasks:
    ingest  -> cognify -> verify      (orchestrated by `pipeline`)

Deploy (tomorrow, needs Render credits):
    1. render.yaml already declares this service (type: workflow).
    2. Dashboard -> Apply Blueprint, or create workflow service pointing at
       services/cognee-service with startCommand `python workflows.py`.
    3. Trigger from the Express backend: POST /api/workflow/run-task
       {"task": "ignite-cognee-pipeline/pipeline", "input": [claimUri, dataset, prompt]}
    4. Observability: Render dashboard -> Workflows -> run history (per-run logs,
       retries, timings). Failures auto-retry per the Retry settings below.

Local note: app.start() needs RENDER_SDK_MODE/RENDER_SDK_SOCKET_PATH env vars
that only Render's runtime provides. Task functions are callable directly
(ctx=None) for local testing.
"""

import os
from urllib.parse import urlparse

import requests

from config import CONFIG
from engine import cognitive_engine
from logging_setup import setup_logging

logger = setup_logging("render-workflow")

from render import Retry, TaskContext, Workflows

app = Workflows()


def _read_claim_payload(claim_uri: str) -> str:
    """
    Claim-check pattern (study.md §7): the task receives a lightweight URI, never
    the raw payload. Supports file:// (local / Render disk) and http(s)://
    (S3 / Cloudflare R2 / any presigned URL).
    Fail-fast: an unresolvable claim URI raises — a task retried/marked FAILED on
    the dashboard is honest, a placeholder-text "success" is not.
    """
    parsed = urlparse(claim_uri)
    if parsed.scheme in ("http", "https"):
        logger.info("Downloading claim payload | uri=%s", claim_uri[:120])
        resp = requests.get(claim_uri, timeout=120)
        resp.raise_for_status()
        return resp.text
    if parsed.scheme == "file" or os.path.exists(claim_uri):
        local_path = parsed.path if parsed.scheme == "file" else claim_uri
        logger.info("Reading local claim buffer | path=%s", local_path)
        with open(local_path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    raise ValueError(
        f"Claim URI is not a resolvable file:// or http(s):// location: {claim_uri!r}"
    )


@app.task(
    name="ingest",
    retry=Retry(max_retries=2, wait_duration_ms=2000, backoff_scaling=2.0),
    timeout_seconds=900,
)
async def ingest(ctx: TaskContext, claim_uri: str, dataset_name: str) -> dict:
    """Stage 1 — stream the claim-check payload into Cognee (Extract)."""
    content = _read_claim_payload(claim_uri)
    logger.info("Ingest task | dataset=%s chars=%s", dataset_name, len(content))
    return await cognitive_engine.ingest_content(content, dataset_name)


@app.task(
    name="cognify",
    retry=Retry(max_retries=2, wait_duration_ms=5000, backoff_scaling=2.0),
    timeout_seconds=3600,
)
async def cognify(ctx: TaskContext, dataset_name: str, prompt: str) -> dict:
    """Stage 2 — ECL cognify: token chunking -> Nemotron extraction -> graph load."""
    logger.info("Cognify task | dataset=%s prompt=%r", dataset_name, (prompt or "")[:120])
    return await cognitive_engine.run_cognify(dataset_name, prompt)


@app.task(
    name="verify",
    retry=Retry(max_retries=1, wait_duration_ms=2000),
    timeout_seconds=600,
)
async def verify(ctx: TaskContext, dataset_name: str) -> dict:
    """
    Stage 3 — verify the WHOLE process end-to-end:
      1. Graph: AuraDB reachable, node/relationship counts.
      2. Vector store: semantic retrieval returns this dataset's chunks.
    Returns a structured report; `verified` is the pass/fail signal.
    """
    logger.info("Verify task | dataset=%s", dataset_name)
    report = {"dataset": dataset_name, "graph": {}, "vector": {}, "verified": False}

    # 1. Graph verification (direct driver — independent of the cognify path)
    try:
        from neo4j import GraphDatabase

        uri = CONFIG.get("GRAPH_DATABASE_URL") or CONFIG.get("NEO4J_URI")
        user = CONFIG.get("GRAPH_DATABASE_USERNAME")
        password = CONFIG.get("GRAPH_DATABASE_PASSWORD")
        driver = GraphDatabase.driver(uri, auth=(user, password))
        with driver.session() as session:
            node_count = session.run("MATCH (n) RETURN count(n) AS c").single()["c"]
            rel_count = session.run("MATCH ()-[r]->() RETURN count(r) AS c").single()["c"]
        driver.close()
        report["graph"] = {
            "provider": "neo4j",
            "nodeCount": node_count,
            "relCount": rel_count,
            "ok": node_count > 0,
        }
        logger.info(
            "Verify: graph | nodes=%s rels=%s", node_count, rel_count
        )
    except Exception as exc:
        logger.exception("Verify: graph check FAILED")
        report["graph"] = {"ok": False, "error": str(exc)}

    # 2. Vector store verification (semantic retrieval over this dataset)
    try:
        vector_res = await cognitive_engine.search_memory(
            "dataset content summary", dataset_name, search_type="CHUNKS"
        )
        chunks = vector_res.get("results", []) if vector_res.get("success") else []
        report["vector"] = {
            "provider": CONFIG.get("VECTOR_DB_PROVIDER"),
            "chunksRetrieved": len(chunks),
            "ok": len(chunks) > 0,
        }
        logger.info("Verify: vector | chunks=%s", len(chunks))
    except Exception as exc:
        logger.exception("Verify: vector check FAILED")
        report["vector"] = {"ok": False, "error": str(exc)}

    report["verified"] = bool(report["graph"].get("ok") and report["vector"].get("ok"))
    logger.info("Verify complete | verified=%s", report["verified"])
    return report


@app.task(
    name="pipeline",
    retry=Retry(max_retries=1, wait_duration_ms=5000),
    timeout_seconds=4800,
)
async def pipeline(ctx: TaskContext, claim_uri: str, dataset_name: str, prompt: str) -> dict:
    """
    Orchestrator — the full durable pipeline. Each stage runs in its own
    ephemeral container with independent retries; ctx.run chains them so a
    crash mid-pipeline resumes cleanly from the run history.
    """
    logger.info("Pipeline orchestrator | claim=%s dataset=%s", claim_uri[:80], dataset_name)
    ingest_res = await ctx.run(ingest, claim_uri, dataset_name)
    cognify_res = await ctx.run(cognify, dataset_name, prompt)
    verify_res = await ctx.run(verify, dataset_name)
    return {
        "status": "verified" if verify_res.get("verified") else "completed_with_warnings",
        "ingest": ingest_res,
        "cognify": cognify_res,
        "verify": verify_res,
    }


if __name__ == "__main__":
    # Render's runtime injects RENDER_SDK_MODE + RENDER_SDK_SOCKET_PATH.
    # Locally this raises ValueError unless you run Render's local task server.
    logger.info("Workflows app starting via app.start()")
    app.start()
