"""
FastAPI Microservice for Cognee Cognitive Memory Engine
Provides REST API endpoints for ingestion, directive cognify, and GraphRAG querying.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Any, List

from config import CONFIG
from engine import cognitive_engine
from generator import generate_schema_for_problem_statement

app = FastAPI(
    title="Cognee Cognitive Memory API",
    description="Cognitive Runtime with FastEmbed ONNX, Neo4j Graph, and NVIDIA Nemotron",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    try:
        res = await cognitive_engine.ingest_content(req.content, req.dataset_name)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/cognify")
async def cognify_dataset(req: CognifyRequest):
    try:
        res = await cognitive_engine.run_cognify(req.dataset_name, req.custom_prompt)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/search")
async def search_memory(req: SearchRequest):
    try:
        res = await cognitive_engine.search_memory(req.query, req.dataset_name)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-schema")
def generate_schema(req: SchemaRequest):
    return generate_schema_for_problem_statement(req.problem_statement)

if __name__ == "__main__":
    import os

    import uvicorn

    # 8100 avoids colliding with other local FastAPI projects that commonly squat on 8000
    port = int(os.environ.get("COGNEE_SERVICE_PORT", "8100"))
    uvicorn.run(app, host="0.0.0.0", port=port)
