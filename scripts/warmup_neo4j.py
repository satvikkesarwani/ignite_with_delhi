#!/usr/bin/env python3
"""
Neo4j AuraDB Free Tier Warm-Up & Health Check Script
Prevents 72-hour auto-pausing and validates connectivity 15 minutes before demo evaluation.
"""

import os
import sys

try:
    from dotenv import load_dotenv
    load_dotenv('backend/.env')
    load_dotenv('services/cognee-service/.env')
except ImportError:
    pass

def check_and_warmup():
    uri = os.environ.get("NEO4J_URI", os.environ.get("GRAPH_DATABASE_URL", "neo4j+s://demo.databases.neo4j.io"))
    user = os.environ.get("NEO4J_USERNAME", os.environ.get("GRAPH_DATABASE_USERNAME", "neo4j"))
    password = os.environ.get("NEO4J_PASSWORD", os.environ.get("GRAPH_DATABASE_PASSWORD", "demo_password"))

    print(f"[Neo4j Warm-Up] Attempting connection to: {uri}...")

    try:
        from neo4j import GraphDatabase
        driver = GraphDatabase.driver(uri, auth=(user, password))
        with driver.session() as session:
            # Issue lightweight non-blocking query to keep database instance warm
            result = session.run("MATCH (n) RETURN count(n) AS node_count LIMIT 1;")
            record = result.single()
            node_count = record["node_count"] if record else 0
            print(f"[Neo4j Warm-Up] ✅ SUCCESS! AuraDB instance is active. Node count: {node_count}")
        driver.close()
        return 0
    except ImportError:
        print("[Neo4j Warm-Up] ⚠️ 'neo4j' package not installed. Run: pip install neo4j")
        return 1
    except Exception as e:
        print(f"[Neo4j Warm-Up] ❌ Connection failed: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(check_and_warmup())
