"""
FastAPI Microservice for Cognee Cognitive Memory Engine
Provides REST API endpoints for ingestion, directive cognify, and GraphRAG querying.
Deep logging: every request is timed, stamped with a correlation id (X-Request-Id
from the Node backend or generated), and every failure is logged with a full traceback.
"""

import logging
import time
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Any, List

from config import CONFIG
from engine import cognitive_engine
from generator import generate_schema_for_problem_statement
from logging_setup import setup_logging, request_id_var

logger = setup_logging("cognee-api")

app = FastAPI(
    title="Cognee Cognitive Memory API",
    description="Cognitive Runtime with FastEmbed ONNX, Neo4j Graph, and NVIDIA Nemotron",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """Correlate every request: reuse the Node backend's X-Request-Id when present."""
    request_id = request.headers.get("X-Request-Id") or uuid.uuid4().hex[:12]
    request_id_var.set(request_id)

    started_at = time.time()
    logger.info("%s %s ->", request.method, request.url.path)
    try:
        response = await call_next(request)
    except Exception as exc:
        duration_ms = int((time.time() - started_at) * 1000)
        logger.exception(
            "%s %s <- UNHANDLED EXCEPTION (%s ms)", request.method, request.url.path, duration_ms
        )
        raise
    duration_ms = int((time.time() - started_at) * 1000)
    response.headers["X-Request-Id"] = request_id
    log_fn = logger.error if response.status_code >= 500 else logger.warning if response.status_code >= 400 else logger.info
    log_fn(
        "%s %s <- %s (%s ms)",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


logger.info(
    "Cognee API starting | embedding=%s/%s graph=%s/%s llm=%s chunk=%s llm_key_set=%s",
    CONFIG.get("EMBEDDING_PROVIDER"),
    CONFIG.get("EMBEDDING_MODEL"),
    CONFIG.get("GRAPH_DATABASE_PROVIDER"),
    CONFIG.get("GRAPH_DATASET_DATABASE_HANDLER"),
    CONFIG.get("LLM_MODEL"),
    CONFIG.get("CHUNK_SIZE"),
    bool(CONFIG.get("LLM_API_KEY")),
)


class IngestRequest(BaseModel):
    content: str
    dataset_name: Optional[str] = "hackathon_domain_memory"


class CognifyRequest(BaseModel):
    dataset_name: Optional[str] = "hackathon_domain_memory"
    custom_prompt: Optional[str] = None


class SearchRequest(BaseModel):
    query: str
    dataset_name: Optional[str] = "hackathon_domain_memory"
    search_type: Optional[str] = "GRAPH_COMPLETION"


class SchemaRequest(BaseModel):
    problem_statement: str


@app.get("/health")
def health_check():
    logger.debug("Health probe")
    return {
        "status": "healthy",
        "service": "cognee-cognitive-engine",
        "embedding_provider": CONFIG.get("EMBEDDING_PROVIDER"),
        "embedding_model": CONFIG.get("EMBEDDING_MODEL"),
        "graph_provider": CONFIG.get("GRAPH_DATABASE_PROVIDER"),
        "graph_handler": CONFIG.get("GRAPH_DATASET_DATABASE_HANDLER"),
        "chunk_size": CONFIG.get("CHUNK_SIZE"),
    }


@app.post("/api/ingest")
async def ingest_content(req: IngestRequest):
    logger.info("Ingest request | dataset=%s content_chars=%s", req.dataset_name, len(req.content))
    try:
        return await cognitive_engine.ingest_content(req.content, req.dataset_name)
    except Exception as e:
        logger.exception("Ingest failed for dataset '%s'", req.dataset_name)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/cognify")
async def cognify_dataset(req: CognifyRequest):
    logger.info("Cognify request | dataset=%s prompt=%r", req.dataset_name, (req.custom_prompt or "")[:120])
    try:
        return await cognitive_engine.run_cognify(req.dataset_name, req.custom_prompt)
    except Exception as e:
        logger.exception("Cognify failed for dataset '%s'", req.dataset_name)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/search")
async def search_memory(req: SearchRequest):
    logger.info("Search request | dataset=%s query=%r", req.dataset_name, req.query[:150])
    try:
        return await cognitive_engine.search_memory(req.query, req.dataset_name, req.search_type)
    except Exception as e:
        logger.exception("Search failed for dataset '%s'", req.dataset_name)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/generate-schema")
def generate_schema(req: SchemaRequest):
    logger.info("Schema generation request | ps=%r", req.problem_statement[:150])
    result = generate_schema_for_problem_statement(req.problem_statement)
    logger.info("Schema generated via %s", result.get("source"))
    return result


class EmbedEntitiesRequest(BaseModel):
    label: str = "Entity"
    limit: int = 500


class EmbedTextsRequest(BaseModel):
    texts: List[str]


@app.post("/api/graph/embed-entities")
def embed_entities_route(req: EmbedEntitiesRequest):
    """U2: write FastEmbed vectors onto :Entity nodes + ensure the Neo4j vector index."""
    logger.info("Embed-entities request | label=%s limit=%s", req.label, req.limit)
    try:
        from graph_embeddings import embed_entities

        result = embed_entities(req.label, req.limit)
        logger.info("Embed-entities done | %s", result)
        return result
    except Exception as e:
        logger.exception("Embed-entities failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/embed")
def embed_texts_route(req: EmbedTextsRequest):
    """U2: embed arbitrary texts (used for query vectors in hybrid retrieval)."""
    try:
        from graph_embeddings import embed_texts

        return {"embeddings": embed_texts(req.texts)}
    except Exception as e:
        logger.exception("Embed failed")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import os

    import uvicorn

    # 8100 avoids colliding with other local FastAPI projects that commonly squat on 8000
    port = int(os.environ.get("COGNEE_SERVICE_PORT", "8100"))
    logger.info("Starting uvicorn on port %s", port)
    uvicorn.run(app, host="0.0.0.0", port=port)
