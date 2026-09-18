"""
Cognee Custom DataPoint Schemas with SkipValidation & Directive Prompting
Reference implementation based on Cognee ECL cognitive runtime architecture.
"""

from typing import Any, Optional
from pydantic_core import SkipValidation

try:
    from cognee.infrastructure.engine import DataPoint
    from cognee.infrastructure.engine.models.DataPoint import MetaData
except ImportError:
    # Fallback placeholder if cognee is not yet installed in local python environment
    class DataPoint:
        pass
    MetaData = dict

class ShellAccount(DataPoint):
    account_number: str
    jurisdiction: str
    metadata: MetaData = {"index_fields": ["account_number", "jurisdiction"]}

class FinancialTransaction(DataPoint):
    transaction_id: str
    amount: float
    currency: str
    # destination references another node; SkipValidation prevents circular Pydantic compilation errors
    destination: SkipValidation[Any] = None 
    metadata: MetaData = {"index_fields": ["transaction_id", "currency"]}

class EntityNode(DataPoint):
    name: str
    entity_type: str
    risk_score: float = 0.0
    connected_entities: SkipValidation[Any] = None
    metadata: MetaData = {"index_fields": ["name", "entity_type"]}

print("[sample_datapoints] ✅ Custom DataPoint schemas compiled successfully.")
