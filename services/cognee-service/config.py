"""
Configuration module for Cognee Cognitive Memory Engine
Enforces Issue #2697 fixes, FastEmbed ONNX zero-cost embeddings, and Neo4j AuraDB integration.
"""

import os
from dotenv import load_dotenv

# Load local .env if available
load_dotenv(override=False)

def configure_cognee_environment():
    """
    Applies recommended architectural defaults into os.environ
    before Cognee modules are imported or initialized.
    """
    defaults = {
        # Neo4j & Graph handler configuration (Critical Issue #2697 fix)
        "GRAPH_DATABASE_PROVIDER": os.environ.get("GRAPH_DATABASE_PROVIDER", "neo4j"),
        "GRAPH_DATASET_DATABASE_HANDLER": os.environ.get("GRAPH_DATASET_DATABASE_HANDLER", "neo4j_aura_dev"),
        "GRAPH_DATABASE_URL": os.environ.get("GRAPH_DATABASE_URL", os.environ.get("NEO4J_URI", "neo4j+s://demo.databases.neo4j.io")),
        "GRAPH_DATABASE_USERNAME": os.environ.get("GRAPH_DATABASE_USERNAME", os.environ.get("NEO4J_USERNAME", "neo4j")),
        "GRAPH_DATABASE_PASSWORD": os.environ.get("GRAPH_DATABASE_PASSWORD", os.environ.get("NEO4J_PASSWORD", "mock_pass")),
        "ENABLE_BACKEND_ACCESS_CONTROL": os.environ.get("ENABLE_BACKEND_ACCESS_CONTROL", "false"),
        
        # Zero-Cost Local FastEmbed & LanceDB
        "EMBEDDING_PROVIDER": os.environ.get("EMBEDDING_PROVIDER", "fastembed"),
        "EMBEDDING_MODEL": os.environ.get("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5"),
        "VECTOR_DB_PROVIDER": os.environ.get("VECTOR_DB_PROVIDER", "lancedb"),
        
        # Token-Based Chunking Configuration
        "CHUNK_SIZE": os.environ.get("CHUNK_SIZE", "500"),
        "CHUNK_OVERLAP": os.environ.get("CHUNK_OVERLAP", "10"),
        "CHUNK_ENGINE": os.environ.get("CHUNK_ENGINE", "token"),

        # NVIDIA NIM Nemotron LLM Configuration
        "LLM_PROVIDER": os.environ.get("LLM_PROVIDER", "openai"),
        "LLM_MODEL": os.environ.get("LLM_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b"),
        "LLM_ENDPOINT": os.environ.get("LLM_ENDPOINT", "https://integrate.api.nvidia.com/v1"),
        "LLM_API_KEY": os.environ.get("LLM_API_KEY", os.environ.get("NVIDIA_API_KEY_1", "")),
    }

    for key, value in defaults.items():
        if key not in os.environ or not os.environ[key]:
            os.environ[key] = value

    return defaults

# Apply immediately upon import
CONFIG = configure_cognee_environment()
