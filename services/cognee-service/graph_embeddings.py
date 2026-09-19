"""
Neo4j-native vector embeddings for the knowledge graph (courses.md Module 6).

Bridges the two stores: FastEmbed computes 384-dim vectors for :Entity nodes
(name + description), writes them as node properties, and maintains a Neo4j
VECTOR INDEX — enabling hybrid GraphRAG retrieval in a single Cypher query:
    vector seed (db.index.vector.queryNodes) + graph expansion (MATCH).
"""

from config import CONFIG
from logging_setup import setup_logging

logger = setup_logging("graph-embeddings")

_model = None
INDEX_NAME = "entity_embeddings_idx"


def _get_model():
    global _model
    if _model is None:
        from fastembed import TextEmbedding

        _model = TextEmbedding(model_name=CONFIG.get("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5"))
    return _model


def embed_texts(texts):
    """Embed a list of strings with the project's FastEmbed model."""
    model = _get_model()
    return [list(map(float, v)) for v in model.embed(texts)]


def _driver():
    from neo4j import GraphDatabase

    return GraphDatabase.driver(
        CONFIG.get("GRAPH_DATABASE_URL"),
        auth=(CONFIG.get("GRAPH_DATABASE_USERNAME"), CONFIG.get("GRAPH_DATABASE_PASSWORD")),
    )


def embed_entities(label="Entity", limit=500):
    """
    Sync :Entity nodes with embeddings and ensure the Neo4j vector index exists.
    Only nodes missing `embedding` are embedded (idempotent — safe to re-run).
    """
    if not CONFIG.get("GRAPH_DATABASE_URL"):
        raise RuntimeError("GRAPH_DATABASE_URL not configured — cannot embed entities")

    driver = _driver()
    embedded = 0
    dims = None
    with driver.session() as session:
        nodes = session.run(
            f"MATCH (n:`{label}`) WHERE n.embedding IS NULL "
            "RETURN elementId(n) AS eid, n.name AS name, n.description AS description "
            "LIMIT $limit",
            limit=limit,
        ).data()
        logger.info("Embedding pass | label=%s nodes_to_embed=%s", label, len(nodes))

        if nodes:
            texts = [
                f"{n.get('name') or ''}. {n.get('description') or ''}".strip() or n["eid"]
                for n in nodes
            ]
            vectors = embed_texts(texts)
            for node, vector in zip(nodes, vectors):
                dims = len(vector)
                session.run(
                    "MATCH (n) WHERE elementId(n) = $eid SET n.embedding = $emb",
                    eid=node["eid"],
                    emb=vector,
                )
            embedded = len(nodes)
            logger.info("Embeddings written | count=%s dims=%s", embedded, dims)

        # Vector index (idempotent). Needs at least one embedded node to be useful.
        if embedded or dims:
            session.run(
                f"CREATE VECTOR INDEX {INDEX_NAME} IF NOT EXISTS "
                f"FOR (n:`{label}`) ON (n.embedding) "
                "OPTIONS {indexConfig: {`vector.dimensions`: $dims, "
                "`vector.similarity_function`: 'cosine'}}",
                dims=dims or 384,
            )
            logger.info("Vector index ensured | name=%s dims=%s", INDEX_NAME, dims or 384)

        total = session.run(
            f"MATCH (n:`{label}`) WHERE n.embedding IS NOT NULL RETURN count(n) AS c"
        ).single()["c"]

    driver.close()
    return {"label": label, "embedded_now": embedded, "total_indexed": total, "dimensions": dims}
