"""
A/B Experiments API

Compare prompt performance across variants:
- Create experiments with multiple prompt variants
- Track metrics: quality, latency, cost, user preference
- Statistical significance testing
- Automatic winner selection
"""

from __future__ import annotations
import logging
import random
import statistics
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.auth import require_auth, get_db

logger = logging.getLogger("tracevox.experiments")
router = APIRouter(prefix="/experiments", tags=["A/B Experiments"])


# =============================================================================
# MODELS
# =============================================================================

class ExperimentStatus(str, Enum):
    DRAFT = "draft"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class VariantMessage(BaseModel):
    role: str
    content: str


class ExperimentVariant(BaseModel):
    """A variant in the experiment."""
    name: str = Field(..., max_length=50)
    description: Optional[str] = None
    messages: List[VariantMessage]
    model: Optional[str] = None  # Override experiment default
    provider: Optional[str] = None
    temperature: Optional[float] = None
    weight: float = Field(default=1.0, description="Traffic weight for this variant")


class ExperimentCreate(BaseModel):
    """Create a new experiment."""
    name: str = Field(..., max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    hypothesis: Optional[str] = Field(None, description="What you're testing")
    # Variants
    variants: List[ExperimentVariant] = Field(..., min_items=2)
    # Default settings
    default_model: str = Field(default="gpt-4o-mini")
    default_provider: str = Field(default="openai")
    default_temperature: float = Field(default=0.7)
    default_max_tokens: int = Field(default=1024)
    # Experiment settings
    traffic_percentage: float = Field(default=100, ge=0, le=100, description="% of traffic to include")
    target_samples: int = Field(default=100, description="Target sample size per variant")
    # Metrics to track
    track_latency: bool = True
    track_cost: bool = True
    track_tokens: bool = True
    track_user_rating: bool = False


class ExperimentUpdate(BaseModel):
    """Update experiment settings."""
    name: Optional[str] = None
    description: Optional[str] = None
    hypothesis: Optional[str] = None
    traffic_percentage: Optional[float] = None
    target_samples: Optional[int] = None
    status: Optional[ExperimentStatus] = None


class RecordResultRequest(BaseModel):
    """Record a result for an experiment."""
    variant_id: str
    latency_ms: int
    tokens: Dict[str, int]
    cost: Dict[str, float]
    success: bool = True
    error: Optional[str] = None
    user_rating: Optional[int] = Field(None, ge=1, le=5)
    custom_metrics: Optional[Dict[str, Any]] = None


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def calculate_statistics(values: List[float]) -> Dict[str, float]:
    """Calculate statistics for a list of values."""
    if not values:
        return {"mean": 0, "median": 0, "std_dev": 0, "min": 0, "max": 0, "count": 0}
    
    return {
        "mean": round(statistics.mean(values), 4),
        "median": round(statistics.median(values), 4),
        "std_dev": round(statistics.stdev(values) if len(values) > 1 else 0, 4),
        "min": round(min(values), 4),
        "max": round(max(values), 4),
        "count": len(values),
    }


def calculate_confidence_interval(values: List[float], confidence: float = 0.95) -> tuple:
    """Calculate confidence interval for mean."""
    if len(values) < 2:
        mean = values[0] if values else 0
        return (mean, mean)
    
    import math
    n = len(values)
    mean = statistics.mean(values)
    std_err = statistics.stdev(values) / math.sqrt(n)
    
    # Z-score for 95% confidence
    z = 1.96 if confidence == 0.95 else 2.576  # 99%
    
    margin = z * std_err
    return (round(mean - margin, 4), round(mean + margin, 4))


def is_statistically_significant(values_a: List[float], values_b: List[float], threshold: float = 0.05) -> bool:
    """Check if difference between two groups is statistically significant using t-test."""
    if len(values_a) < 5 or len(values_b) < 5:
        return False
    
    try:
        # Simple two-sample t-test approximation
        import math
        
        mean_a = statistics.mean(values_a)
        mean_b = statistics.mean(values_b)
        var_a = statistics.variance(values_a)
        var_b = statistics.variance(values_b)
        n_a = len(values_a)
        n_b = len(values_b)
        
        # Pooled standard error
        se = math.sqrt(var_a/n_a + var_b/n_b)
        if se == 0:
            return False
        
        # t-statistic
        t = abs(mean_a - mean_b) / se
        
        # Degrees of freedom (Welch's approximation)
        df = ((var_a/n_a + var_b/n_b)**2) / (
            (var_a/n_a)**2/(n_a-1) + (var_b/n_b)**2/(n_b-1)
        )
        
        # Critical value for two-tailed test at 0.05
        # Using approximation: for df > 30, t_crit ≈ 1.96
        t_crit = 1.96 if df > 30 else 2.0
        
        return t > t_crit
        
    except Exception:
        return False


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("")
async def list_experiments(
    status: Optional[ExperimentStatus] = None,
    current_user: dict = Depends(require_auth),
):
    """
    List all experiments for the organization.
    """
    org_id = current_user["org_id"]
    
    db = get_db()
    if not db:
        return {"experiments": []}
    
    try:
        query = db.collection("experiments").where("org_id", "==", org_id)
        
        if status:
            query = query.where("status", "==", status.value)
        
        experiments = []
        for doc in query.stream():
            data = doc.to_dict()
            experiments.append({
                "id": doc.id,
                "name": data.get("name"),
                "description": data.get("description"),
                "hypothesis": data.get("hypothesis"),
                "status": data.get("status", "draft"),
                "variant_count": len(data.get("variants", [])),
                "total_samples": data.get("total_samples", 0),
                "target_samples": data.get("target_samples", 100),
                "traffic_percentage": data.get("traffic_percentage", 100),
                "created_at": data.get("created_at").isoformat() if data.get("created_at") else None,
                "started_at": data.get("started_at").isoformat() if data.get("started_at") else None,
                "completed_at": data.get("completed_at").isoformat() if data.get("completed_at") else None,
            })
        
        # Sort by created date
        experiments.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        
        return {"experiments": experiments}
        
    except Exception as e:
        logger.error(f"Failed to list experiments: {e}")
        return {"experiments": [], "error": str(e)}


@router.post("")
async def create_experiment(
    request: ExperimentCreate,
    current_user: dict = Depends(require_auth),
):
    """
    Create a new A/B experiment.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    now = datetime.now(timezone.utc)
    
    # Prepare variants with IDs
    variants = []
    for i, v in enumerate(request.variants):
        variants.append({
            "id": f"variant_{i}",
            "name": v.name,
            "description": v.description,
            "messages": [{"role": m.role, "content": m.content} for m in v.messages],
            "model": v.model or request.default_model,
            "provider": v.provider or request.default_provider,
            "temperature": v.temperature or request.default_temperature,
            "weight": v.weight,
            "samples": 0,
            "results": [],
        })
    
    experiment_data = {
        "org_id": org_id,
        "created_by": user_id,
        "name": request.name,
        "description": request.description,
        "hypothesis": request.hypothesis,
        "variants": variants,
        "default_model": request.default_model,
        "default_provider": request.default_provider,
        "default_temperature": request.default_temperature,
        "default_max_tokens": request.default_max_tokens,
        "traffic_percentage": request.traffic_percentage,
        "target_samples": request.target_samples,
        "track_latency": request.track_latency,
        "track_cost": request.track_cost,
        "track_tokens": request.track_tokens,
        "track_user_rating": request.track_user_rating,
        "status": ExperimentStatus.DRAFT.value,
        "total_samples": 0,
        "created_at": now,
        "updated_at": now,
    }
    
    exp_ref = db.collection("experiments").add(experiment_data)
    
    logger.info(f"Created experiment '{request.name}' for org {org_id}")
    
    return {
        "success": True,
        "experiment_id": exp_ref[1].id,
        "name": request.name,
        "variant_count": len(variants),
    }


@router.get("/{experiment_id}")
async def get_experiment(
    experiment_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Get experiment details with results.
    """
    org_id = current_user["org_id"]
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    doc = db.collection("experiments").document(experiment_id).get()
    if not doc.exists:
        raise HTTPException(404, "Experiment not found")
    
    data = doc.to_dict()
    if data.get("org_id") != org_id:
        raise HTTPException(404, "Experiment not found")
    
    # Calculate statistics for each variant
    variants_with_stats = []
    for variant in data.get("variants", []):
        results = variant.get("results", [])
        
        latencies = [r["latency_ms"] for r in results if r.get("latency_ms")]
        costs = [r["cost"]["total_cost_usd"] for r in results if r.get("cost")]
        tokens = [r["tokens"]["total"] for r in results if r.get("tokens")]
        ratings = [r["user_rating"] for r in results if r.get("user_rating")]
        successes = [1 for r in results if r.get("success")]
        
        variants_with_stats.append({
            "id": variant.get("id"),
            "name": variant.get("name"),
            "description": variant.get("description"),
            "model": variant.get("model"),
            "provider": variant.get("provider"),
            "weight": variant.get("weight"),
            "samples": variant.get("samples", 0),
            "stats": {
                "latency": calculate_statistics(latencies),
                "cost": calculate_statistics(costs),
                "tokens": calculate_statistics(tokens),
                "rating": calculate_statistics(ratings) if ratings else None,
                "success_rate": round(len(successes) / len(results) * 100, 2) if results else 0,
            },
            "confidence_intervals": {
                "latency": calculate_confidence_interval(latencies),
                "cost": calculate_confidence_interval(costs),
            } if len(latencies) >= 2 else None,
        })
    
    # Determine leader
    leader = None
    if len(variants_with_stats) >= 2:
        # Compare by cost (lower is better)
        sorted_by_cost = sorted(variants_with_stats, key=lambda v: v["stats"]["cost"]["mean"])
        if sorted_by_cost[0]["stats"]["cost"]["count"] >= 5:
            leader = {
                "variant_id": sorted_by_cost[0]["id"],
                "variant_name": sorted_by_cost[0]["name"],
                "metric": "cost",
                "improvement": round(
                    (sorted_by_cost[1]["stats"]["cost"]["mean"] - sorted_by_cost[0]["stats"]["cost"]["mean"]) 
                    / sorted_by_cost[1]["stats"]["cost"]["mean"] * 100, 2
                ) if sorted_by_cost[1]["stats"]["cost"]["mean"] > 0 else 0,
            }
    
    return {
        "id": experiment_id,
        "name": data.get("name"),
        "description": data.get("description"),
        "hypothesis": data.get("hypothesis"),
        "status": data.get("status"),
        "variants": variants_with_stats,
        "settings": {
            "default_model": data.get("default_model"),
            "default_provider": data.get("default_provider"),
            "traffic_percentage": data.get("traffic_percentage"),
            "target_samples": data.get("target_samples"),
        },
        "total_samples": data.get("total_samples", 0),
        "leader": leader,
        "created_at": data.get("created_at").isoformat() if data.get("created_at") else None,
        "started_at": data.get("started_at").isoformat() if data.get("started_at") else None,
        "completed_at": data.get("completed_at").isoformat() if data.get("completed_at") else None,
    }


@router.post("/{experiment_id}/start")
async def start_experiment(
    experiment_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Start running an experiment.
    """
    org_id = current_user["org_id"]
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    doc_ref = db.collection("experiments").document(experiment_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(404, "Experiment not found")
    
    data = doc.to_dict()
    if data.get("org_id") != org_id:
        raise HTTPException(404, "Experiment not found")
    
    if data.get("status") not in [ExperimentStatus.DRAFT.value, ExperimentStatus.PAUSED.value]:
        raise HTTPException(400, f"Cannot start experiment in '{data.get('status')}' status")
    
    doc_ref.update({
        "status": ExperimentStatus.RUNNING.value,
        "started_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    })
    
    return {"success": True, "status": "running"}


@router.post("/{experiment_id}/pause")
async def pause_experiment(
    experiment_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Pause a running experiment.
    """
    org_id = current_user["org_id"]
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    doc_ref = db.collection("experiments").document(experiment_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(404, "Experiment not found")
    
    data = doc.to_dict()
    if data.get("org_id") != org_id:
        raise HTTPException(404, "Experiment not found")
    
    if data.get("status") != ExperimentStatus.RUNNING.value:
        raise HTTPException(400, "Experiment is not running")
    
    doc_ref.update({
        "status": ExperimentStatus.PAUSED.value,
        "updated_at": datetime.now(timezone.utc),
    })
    
    return {"success": True, "status": "paused"}


@router.post("/{experiment_id}/complete")
async def complete_experiment(
    experiment_id: str,
    winner_variant_id: Optional[str] = None,
    current_user: dict = Depends(require_auth),
):
    """
    Mark experiment as completed.
    """
    org_id = current_user["org_id"]
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    doc_ref = db.collection("experiments").document(experiment_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(404, "Experiment not found")
    
    data = doc.to_dict()
    if data.get("org_id") != org_id:
        raise HTTPException(404, "Experiment not found")
    
    doc_ref.update({
        "status": ExperimentStatus.COMPLETED.value,
        "winner_variant_id": winner_variant_id,
        "completed_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    })
    
    return {"success": True, "status": "completed", "winner": winner_variant_id}


@router.post("/{experiment_id}/assign")
async def assign_variant(
    experiment_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Assign a variant for a new request (for use in production).
    Returns which variant to use based on traffic allocation.
    """
    org_id = current_user["org_id"]
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    doc = db.collection("experiments").document(experiment_id).get()
    if not doc.exists:
        raise HTTPException(404, "Experiment not found")
    
    data = doc.to_dict()
    if data.get("org_id") != org_id:
        raise HTTPException(404, "Experiment not found")
    
    if data.get("status") != ExperimentStatus.RUNNING.value:
        raise HTTPException(400, "Experiment is not running")
    
    # Check if request should be part of experiment
    if random.random() * 100 > data.get("traffic_percentage", 100):
        return {"included": False, "variant": None}
    
    # Weight-based random assignment
    variants = data.get("variants", [])
    total_weight = sum(v.get("weight", 1) for v in variants)
    
    rand = random.random() * total_weight
    cumulative = 0
    
    for variant in variants:
        cumulative += variant.get("weight", 1)
        if rand <= cumulative:
            return {
                "included": True,
                "variant": {
                    "id": variant.get("id"),
                    "name": variant.get("name"),
                    "messages": variant.get("messages"),
                    "model": variant.get("model"),
                    "provider": variant.get("provider"),
                    "temperature": variant.get("temperature"),
                },
            }
    
    # Fallback to first variant
    return {
        "included": True,
        "variant": {
            "id": variants[0].get("id"),
            "name": variants[0].get("name"),
            "messages": variants[0].get("messages"),
            "model": variants[0].get("model"),
            "provider": variants[0].get("provider"),
            "temperature": variants[0].get("temperature"),
        },
    }


@router.post("/{experiment_id}/record")
async def record_result(
    experiment_id: str,
    request: RecordResultRequest,
    current_user: dict = Depends(require_auth),
):
    """
    Record a result for a variant.
    """
    org_id = current_user["org_id"]
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    doc_ref = db.collection("experiments").document(experiment_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(404, "Experiment not found")
    
    data = doc.to_dict()
    if data.get("org_id") != org_id:
        raise HTTPException(404, "Experiment not found")
    
    # Find variant and add result
    variants = data.get("variants", [])
    variant_found = False
    
    for variant in variants:
        if variant.get("id") == request.variant_id:
            variant_found = True
            variant["samples"] = variant.get("samples", 0) + 1
            variant["results"] = variant.get("results", [])
            variant["results"].append({
                "latency_ms": request.latency_ms,
                "tokens": request.tokens,
                "cost": request.cost,
                "success": request.success,
                "error": request.error,
                "user_rating": request.user_rating,
                "custom_metrics": request.custom_metrics,
                "recorded_at": datetime.now(timezone.utc).isoformat(),
            })
            break
    
    if not variant_found:
        raise HTTPException(404, f"Variant '{request.variant_id}' not found")
    
    # Update experiment
    total_samples = sum(v.get("samples", 0) for v in variants)
    target_samples = data.get("target_samples", 100) * len(variants)
    
    updates = {
        "variants": variants,
        "total_samples": total_samples,
        "updated_at": datetime.now(timezone.utc),
    }
    
    # Auto-complete if target reached
    if total_samples >= target_samples and data.get("status") == ExperimentStatus.RUNNING.value:
        updates["status"] = ExperimentStatus.COMPLETED.value
        updates["completed_at"] = datetime.now(timezone.utc)
    
    doc_ref.update(updates)
    
    return {
        "success": True,
        "total_samples": total_samples,
        "target_reached": total_samples >= target_samples,
    }


@router.delete("/{experiment_id}")
async def delete_experiment(
    experiment_id: str,
    current_user: dict = Depends(require_auth),
):
    """
    Delete an experiment.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    doc_ref = db.collection("experiments").document(experiment_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(404, "Experiment not found")
    
    data = doc.to_dict()
    if data.get("org_id") != org_id:
        raise HTTPException(404, "Experiment not found")
    
    if data.get("created_by") != user_id:
        raise HTTPException(403, "Only the experiment creator can delete it")
    
    doc_ref.update({
        "status": ExperimentStatus.ARCHIVED.value,
        "archived_at": datetime.now(timezone.utc),
    })
    
    return {"success": True, "message": "Experiment archived"}

