"""Evaluation test suite for classification accuracy, reply eligibility, and opportunity extraction."""

from __future__ import annotations

import json
from pathlib import Path
import pytest

from app.core.config import Settings
from app.services.classifier import _heuristic_classify


@pytest.fixture
def eval_dataset():
    path = Path(__file__).parent / "evaluation_dataset.json"
    return json.loads(path.read_text(encoding="utf-8"))


def test_evaluation_dataset_classification_accuracy(eval_dataset):
    correct_category_count = 0
    total = len(eval_dataset)
    mismatches = []

    for case in eval_dataset:
        result = _heuristic_classify(
            subject=case["subject"],
            body=case["body_text"],
            sender=f"{case['sender_name']} <{case['sender_email']}>",
        )
        if result["category"] == case["expected_category"] or (
            case["expected_category"] in {"Job Opportunity", "Internship"}
            and result["category"] in {"Job Opportunity", "Internship", "Internship Opportunity"}
        ):
            correct_category_count += 1
        else:
            mismatches.append((case["id"], case["expected_category"], result["category"]))

    accuracy = correct_category_count / total
    assert accuracy >= 0.85, f"Classification accuracy {accuracy:.2f} is below 85% threshold. Mismatches: {mismatches}"


def test_evaluation_dataset_reply_eligibility(eval_dataset):
    correct_eligibility_count = 0
    total = len(eval_dataset)

    for case in eval_dataset:
        result = _heuristic_classify(
            subject=case["subject"],
            body=case["body_text"],
            sender=f"{case['sender_name']} <{case['sender_email']}>",
        )
        if result["reply_eligibility"] == case["expected_reply_eligibility"]:
            correct_eligibility_count += 1

    eligibility_accuracy = correct_eligibility_count / total
    assert eligibility_accuracy >= 0.90, f"Reply eligibility accuracy {eligibility_accuracy:.2f} is below 90% threshold."


def test_evaluation_dataset_false_opportunity_detection(eval_dataset):
    for case in eval_dataset:
        result = _heuristic_classify(
            subject=case["subject"],
            body=case["body_text"],
            sender=f"{case['sender_name']} <{case['sender_email']}>",
        )
        if not case["expected_opportunity_extracted"]:
            # If expected_opportunity_extracted is false, opportunity must be None or sanitized to None
            assert result["opportunity"] is None, f"False opportunity extracted for test case {case['id']}: {result['opportunity']}"
