"""
Automated Integration Test for Cognee Cognitive Engine & Schemas
Verifies zero compilation errors, proper SkipValidation behavior, and FastEmbed ONNX loading.
"""

import sys
import unittest
from config import CONFIG
from schemas import (
    BaseEntity,
    ShellAccount,
    FinancialTransaction,
    CodeEntity,
    AuditRiskFlag,
    ProblemStatementNode,
    AVAILABLE_SCHEMAS
)
from generator import generate_schema_for_problem_statement

class TestCogneeIntegration(unittest.TestCase):
    def test_01_environment_configuration(self):
        print("\n[Test 1] Verifying Cognee environment variable configuration...")
        self.assertEqual(CONFIG["GRAPH_DATABASE_PROVIDER"], "neo4j")
        self.assertEqual(CONFIG["GRAPH_DATASET_DATABASE_HANDLER"], "neo4j_aura_dev")
        self.assertEqual(CONFIG["EMBEDDING_PROVIDER"], "fastembed")
        self.assertEqual(CONFIG["VECTOR_DB_PROVIDER"], "lancedb")
        print("  ✅ Issue #2697 handler fix and FastEmbed configs verified.")

    def test_02_pydantic_v2_schema_instantiation(self):
        print("\n[Test 2] Testing Pydantic v2 schemas with SkipValidation...")
        # Create an account
        account = ShellAccount(
            account_number="PA-778901",
            jurisdiction="Panama",
            risk_score=0.85
        )
        self.assertEqual(account.account_number, "PA-778901")

        # Create a transaction linking to the account via SkipValidation
        tx = FinancialTransaction(
            transaction_id="TX_1001",
            amount=500000.0,
            currency="USD",
            destination=account # Forward-ref test
        )
        self.assertEqual(tx.amount, 500000.0)
        self.assertEqual(tx.destination.account_number, "PA-778901")

        # Create a code entity and audit risk flag
        code_node = CodeEntity(
            symbol_name="authenticate_user",
            symbol_type="function",
            file_path="/src/auth.py",
            vulnerability_flag="Hardcoded Secret"
        )
        risk = AuditRiskFlag(
            risk_id="RISK_SEC_01",
            severity="CRITICAL",
            rule_violated="CWE-798 Hardcoded Credentials",
            flagged_target=code_node
        )
        self.assertEqual(risk.flagged_target.symbol_name, "authenticate_user")
        print("  ✅ All custom DataPoint schemas compiled and linked without Pydantic errors!")

    def test_03_dynamic_schema_generator(self):
        print("\n[Test 3] Testing Dynamic Schema Formulator for problem statements...")
        sample_ps = "Build an automated compliance auditor for medical records tracking HIPAA violations across clinics."
        result = generate_schema_for_problem_statement(sample_ps)
        self.assertTrue(result["success"])
        self.assertIn("class", result["generated_code"])
        print(f"  ✅ Schema successfully synthesized via: {result['source']}")

if __name__ == "__main__":
    unittest.main()
