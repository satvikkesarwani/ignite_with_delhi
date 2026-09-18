"""
Configuration module for Cognee Cognitive Memory Engine
Enforces Issue #2697 fixes, FastEmbed ONNX zero-cost embeddings, and Neo4j AuraDB integration.

Smart provider resolution:
- Real Neo4j/AuraDB credentials present -> provider "neo4j" + handler "neo4j_aura_dev".
- Otherwise -> embedded "ladybug" graph so the ECL pipeline runs offline with zero setup.
"""

import os
from dotenv import load_dotenv

# Load local .env if available
load_dotenv(override=False)

_PLACEHOLDER_PASSWORDS = {
    "",
    "mock_pass",
    "password",
    "secret",
    "demo_password",
    "changeme",
    "your_password_here",
}
_PLACEHOLDER_URI_MARKERS = ("demo.", "xxxx", "example")

# Matches the default key pool already shipped in generator.py so `npm run cognee:start`
# performs live LLM extraction with zero manual configuration.
_DEFAULT_NVIDIA_KEY = "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"


def _resolve_llm_api_key():
    """
    LLM key resolution order:
    1. Explicit LLM_API_KEY
    2. NVIDIA_API_KEY_1
    3. First entry of the comma-separated NVIDIA_API_KEYS pool
    4. Repository default (same pool as generator.py / aiService.js)
    """
    candidates = [
        os.environ.get("LLM_API_KEY", ""),
        os.environ.get("NVIDIA_API_KEY_1", ""),
        (os.environ.get("NVIDIA_API_KEYS", "").split(",") or [""])[0].strip(),
        _DEFAULT_NVIDIA_KEY,
    ]
    return next((key.strip() for key in candidates if key and key.strip()), "")


def _normalize_llm_model(model: str, provider: str) -> str:
    """
    litellm (cognee's inference backend) requires an explicit provider prefix for
    OpenAI-compatible endpoints like NVIDIA NIM ("openai/nvidia/..."), otherwise it
    rejects the call with "LLM Provider NOT provided". Normalize any un-prefixed
    or nvidia/-prefixed model name when riding the openai provider.
    """
    model = (model or "").strip()
    if provider.lower() == "openai" and not model.startswith("openai/"):
        return f"openai/{model}"
    return model


def _has_real_graph_credentials():
    uri = os.environ.get("GRAPH_DATABASE_URL") or os.environ.get("NEO4J_URI") or ""
    password = os.environ.get("GRAPH_DATABASE_PASSWORD") or os.environ.get("NEO4J_PASSWORD") or ""
    if password.strip().lower() in _PLACEHOLDER_PASSWORDS:
        return False
    return not any(marker in uri for marker in _PLACEHOLDER_URI_MARKERS)


def configure_cognee_environment():
    """
    Applies recommended architectural defaults into os.environ
    before Cognee modules are imported or initialized.
    """
    has_real_graph = _has_real_graph_credentials()

    defaults = {
        # Neo4j AuraDB when real credentials exist, embedded local graph otherwise
        # (provider "ladybug" is cognee 1.5.x's embedded default, formerly "kuzu")
        "GRAPH_DATABASE_PROVIDER": "neo4j" if has_real_graph else "ladybug",
        "GRAPH_DATASET_DATABASE_HANDLER": "neo4j_aura_dev" if has_real_graph else "ladybug",
        "GRAPH_DATABASE_URL": os.environ.get("GRAPH_DATABASE_URL", os.environ.get("NEO4J_URI", "")),
        "GRAPH_DATABASE_USERNAME": os.environ.get(
            "GRAPH_DATABASE_USERNAME", os.environ.get("NEO4J_USERNAME", "neo4j")
        ),
        "GRAPH_DATABASE_PASSWORD": os.environ.get(
            "GRAPH_DATABASE_PASSWORD", os.environ.get("NEO4J_PASSWORD", "")
        ),
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
        # litellm (cognee's inference backend) requires the "openai/" provider prefix for
        # OpenAI-compatible endpoints like NVIDIA NIM; it strips the prefix before the call.
        "LLM_MODEL": os.environ.get(
            "LLM_MODEL", "openai/nvidia/nemotron-3.5-lightning-30b-a3b"
        ),
        "LLM_ENDPOINT": os.environ.get("LLM_ENDPOINT", "https://integrate.api.nvidia.com/v1"),
        "LLM_API_KEY": _resolve_llm_api_key(),
        # Nemotron's reasoning phase exceeds cognee's 30s startup connection test;
        # skip it — real cognify calls enforce their own timeouts.
        "COGNEE_SKIP_CONNECTION_TEST": os.environ.get("COGNEE_SKIP_CONNECTION_TEST", "true"),
    }

    for key, value in defaults.items():
        if key in ("GRAPH_DATABASE_PROVIDER", "GRAPH_DATASET_DATABASE_HANDLER"):
            # Provider/handler always follow credential reality to avoid
            # cognify crashes against paused or missing AuraDB instances.
            os.environ[key] = value
        elif key == "LLM_MODEL":
            # Always normalize — a raw "nvidia/..." value from .env or env would
            # make every litellm call fail at runtime.
            os.environ[key] = _normalize_llm_model(value, os.environ["LLM_PROVIDER"])
        elif key not in os.environ or not os.environ[key]:
            os.environ[key] = value

    return defaults


# Apply immediately upon import
CONFIG = configure_cognee_environment()
