"""
Pre-Built Pydantic v2 DataPoint Schemas for Cognee Knowledge Graphs
Enforces SkipValidation to eliminate circular reference and compilation errors.
"""

from typing import Any, Optional, List
from pydantic import SkipValidation
from cognee.infrastructure.engine import DataPoint
from cognee.infrastructure.engine.models.DataPoint import MetaData

class BaseEntity(DataPoint):
    entity_id: str
    name: str
    category: str
    description: Optional[str] = ""
    related_to: SkipValidation[Any] = None
    metadata: MetaData = {"index_fields": ["name", "category", "description"]}

class ShellAccount(DataPoint):
    account_number: str
    jurisdiction: str
    risk_score: float = 0.0
    beneficial_owner: SkipValidation[Any] = None
    metadata: MetaData = {"index_fields": ["account_number", "jurisdiction"]}

class FinancialTransaction(DataPoint):
    transaction_id: str
    amount: float
    currency: str = "USD"
    sender_account: SkipValidation[Any] = None
    destination: SkipValidation[Any] = None
    metadata: MetaData = {"index_fields": ["transaction_id", "currency"]}

class CodeEntity(DataPoint):
    symbol_name: str
    symbol_type: str  # function, class, module, api_endpoint
    file_path: str
    vulnerability_flag: Optional[str] = None
    depends_on: SkipValidation[Any] = None
    metadata: MetaData = {"index_fields": ["symbol_name", "symbol_type", "file_path"]}

class AuditRiskFlag(DataPoint):
    risk_id: str
    severity: str  # CRITICAL, HIGH, MEDIUM, LOW
    rule_violated: str
    flagged_target: SkipValidation[Any] = None
    metadata: MetaData = {"index_fields": ["risk_id", "rule_violated", "severity"]}

class ProblemStatementNode(DataPoint):
    statement_id: str
    domain: str
    primary_objective: str
    target_kpi: Optional[str] = None
    addressed_by: SkipValidation[Any] = None
    metadata: MetaData = {"index_fields": ["domain", "primary_objective"]}

# Export registered schema types
AVAILABLE_SCHEMAS = {
    "base": BaseEntity,
    "financial": [ShellAccount, FinancialTransaction, AuditRiskFlag],
    "code_audit": [CodeEntity, AuditRiskFlag],
    "problem_statement": [ProblemStatementNode, BaseEntity],
}
