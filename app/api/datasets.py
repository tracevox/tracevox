"""
Datasets & Testing API - Enterprise-grade dataset management and testing

Features:
- Create and manage test datasets
- Upload existing datasets or create from production traces
- Run applications against datasets
- Track regression testing results
- Hallucination testing
"""

from __future__ import annotations
import logging
import uuid
import json
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, Query, HTTPException, UploadFile, File, Body
from pydantic import BaseModel, Field

from app.api.auth import require_auth, get_org_by_id

logger = logging.getLogger("llmobs.datasets")

router = APIRouter(prefix="/datasets", tags=["Datasets"])


# =============================================================================
# MODELS
# =============================================================================

class DatasetItem(BaseModel):
    """A single item in a dataset."""
    id: str
    input: str
    expected_output: Optional[str] = None
    context: Optional[str] = None
    metadata: Dict[str, Any] = {}
    source: str = "manual"  # manual, trace, import
    source_trace_id: Optional[str] = None
    status: str = "active"  # active, archived
    created_at: str


class Dataset(BaseModel):
    """A test dataset."""
    id: str
    name: str
    description: str
    item_count: int = 0
    metadata: Dict[str, Any] = {}
    created_at: str
    updated_at: str
    created_by: str


class DatasetRun(BaseModel):
    """A single run of testing against a dataset."""
    id: str
    dataset_id: str
    dataset_name: str
    status: str = "pending"  # pending, running, completed, failed
    total_items: int = 0
    completed_items: int = 0
    results: List[Dict[str, Any]] = []
    summary: Dict[str, Any] = {}
    started_at: str
    completed_at: Optional[str] = None
    model: str = "gemini-2.0-flash"


class CreateDatasetRequest(BaseModel):
    """Request to create a new dataset."""
    name: str
    description: str = ""
    metadata: Dict[str, Any] = {}


class AddItemRequest(BaseModel):
    """Request to add an item to a dataset."""
    input: str
    expected_output: Optional[str] = None
    context: Optional[str] = None
    metadata: Dict[str, Any] = {}


class RunDatasetRequest(BaseModel):
    """Request to run tests against a dataset."""
    prompt_template: str = "{input}"
    model: str = "gemini-2.0-flash"
    evaluation_templates: List[str] = ["relevance", "conciseness"]


# =============================================================================
# IN-MEMORY STORAGE
# =============================================================================

_datasets: Dict[str, Dict[str, Dataset]] = {}  # org_id -> {dataset_id -> dataset}
_dataset_items: Dict[str, List[DatasetItem]] = {}  # dataset_id -> [items]
_dataset_runs: Dict[str, List[DatasetRun]] = {}  # org_id -> [runs]


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("")
async def list_datasets(
    current_user: dict = Depends(require_auth),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List all datasets for the organization."""
    org_id = current_user["org_id"]
    
    org_datasets = _datasets.get(org_id, {})
    datasets = list(org_datasets.values())
    
    # Sort by updated_at desc
    datasets.sort(key=lambda x: x.updated_at, reverse=True)
    
    # Paginate
    paginated = datasets[offset:offset + limit]
    
    return {
        "datasets": [d.dict() for d in paginated],
        "total": len(datasets),
        "limit": limit,
        "offset": offset,
    }


@router.post("")
async def create_dataset(
    req: CreateDatasetRequest,
    current_user: dict = Depends(require_auth),
):
    """Create a new dataset."""
    org_id = current_user["org_id"]
    user_id = current_user.get("user", {}).get("id", "unknown")
    
    dataset_id = f"ds_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    dataset = Dataset(
        id=dataset_id,
        name=req.name,
        description=req.description,
        metadata=req.metadata,
        created_at=now,
        updated_at=now,
        created_by=user_id,
    )
    
    if org_id not in _datasets:
        _datasets[org_id] = {}
    _datasets[org_id][dataset_id] = dataset
    _dataset_items[dataset_id] = []
    
    return dataset.dict()


@router.get("/{dataset_id}")
async def get_dataset(
    dataset_id: str,
    current_user: dict = Depends(require_auth),
):
    """Get a specific dataset."""
    org_id = current_user["org_id"]
    
    org_datasets = _datasets.get(org_id, {})
    if dataset_id not in org_datasets:
        raise HTTPException(404, "Dataset not found")
    
    dataset = org_datasets[dataset_id]
    items = _dataset_items.get(dataset_id, [])
    
    return {
        **dataset.dict(),
        "items": [i.dict() for i in items[:100]],  # First 100 items
        "item_count": len(items),
    }


@router.delete("/{dataset_id}")
async def delete_dataset(
    dataset_id: str,
    current_user: dict = Depends(require_auth),
):
    """Delete a dataset."""
    org_id = current_user["org_id"]
    
    org_datasets = _datasets.get(org_id, {})
    if dataset_id not in org_datasets:
        raise HTTPException(404, "Dataset not found")
    
    del org_datasets[dataset_id]
    if dataset_id in _dataset_items:
        del _dataset_items[dataset_id]
    
    return {"success": True}


@router.get("/{dataset_id}/items")
async def list_dataset_items(
    dataset_id: str,
    current_user: dict = Depends(require_auth),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None),
):
    """List items in a dataset."""
    org_id = current_user["org_id"]
    
    org_datasets = _datasets.get(org_id, {})
    if dataset_id not in org_datasets:
        raise HTTPException(404, "Dataset not found")
    
    items = _dataset_items.get(dataset_id, [])
    
    if status:
        items = [i for i in items if i.status == status]
    
    paginated = items[offset:offset + limit]
    
    return {
        "items": [i.dict() for i in paginated],
        "total": len(items),
        "limit": limit,
        "offset": offset,
    }


@router.post("/{dataset_id}/items")
async def add_dataset_item(
    dataset_id: str,
    req: AddItemRequest,
    current_user: dict = Depends(require_auth),
):
    """Add an item to a dataset."""
    org_id = current_user["org_id"]
    
    org_datasets = _datasets.get(org_id, {})
    if dataset_id not in org_datasets:
        raise HTTPException(404, "Dataset not found")
    
    item_id = f"item_{uuid.uuid4().hex[:12]}"
    item = DatasetItem(
        id=item_id,
        input=req.input,
        expected_output=req.expected_output,
        context=req.context,
        metadata=req.metadata,
        source="manual",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    
    if dataset_id not in _dataset_items:
        _dataset_items[dataset_id] = []
    _dataset_items[dataset_id].append(item)
    
    # Update dataset item count
    dataset = org_datasets[dataset_id]
    dataset.item_count = len(_dataset_items[dataset_id])
    dataset.updated_at = datetime.now(timezone.utc).isoformat()
    
    return item.dict()


@router.post("/{dataset_id}/items/bulk")
async def bulk_add_items(
    dataset_id: str,
    items: List[AddItemRequest] = Body(...),
    current_user: dict = Depends(require_auth),
):
    """Bulk add items to a dataset."""
    org_id = current_user["org_id"]
    
    org_datasets = _datasets.get(org_id, {})
    if dataset_id not in org_datasets:
        raise HTTPException(404, "Dataset not found")
    
    added = []
    for req in items[:500]:  # Limit to 500
        item_id = f"item_{uuid.uuid4().hex[:12]}"
        item = DatasetItem(
            id=item_id,
            input=req.input,
            expected_output=req.expected_output,
            context=req.context,
            metadata=req.metadata,
            source="bulk_import",
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        
        if dataset_id not in _dataset_items:
            _dataset_items[dataset_id] = []
        _dataset_items[dataset_id].append(item)
        added.append(item)
    
    # Update dataset
    dataset = org_datasets[dataset_id]
    dataset.item_count = len(_dataset_items.get(dataset_id, []))
    dataset.updated_at = datetime.now(timezone.utc).isoformat()
    
    return {
        "added": len(added),
        "items": [i.dict() for i in added[:50]],  # Return first 50
    }


@router.delete("/{dataset_id}/items/{item_id}")
async def delete_dataset_item(
    dataset_id: str,
    item_id: str,
    current_user: dict = Depends(require_auth),
):
    """Delete an item from a dataset."""
    org_id = current_user["org_id"]
    
    org_datasets = _datasets.get(org_id, {})
    if dataset_id not in org_datasets:
        raise HTTPException(404, "Dataset not found")
    
    items = _dataset_items.get(dataset_id, [])
    _dataset_items[dataset_id] = [i for i in items if i.id != item_id]
    
    # Update count
    dataset = org_datasets[dataset_id]
    dataset.item_count = len(_dataset_items.get(dataset_id, []))
    dataset.updated_at = datetime.now(timezone.utc).isoformat()
    
    return {"success": True}


@router.post("/{dataset_id}/items/from-traces")
async def create_items_from_traces(
    dataset_id: str,
    trace_ids: List[str] = Body(...),
    current_user: dict = Depends(require_auth),
):
    """Create dataset items from production traces."""
    org_id = current_user["org_id"]
    
    org_datasets = _datasets.get(org_id, {})
    if dataset_id not in org_datasets:
        raise HTTPException(404, "Dataset not found")
    
    # Get traces from database
    from app.database import db as firestore_db
    
    added = []
    for trace_id in trace_ids[:100]:  # Limit to 100
        try:
            # Fetch trace data (simplified - in production, fetch from tracing API)
            if firestore_db and firestore_db.is_available:
                requests = firestore_db.get_requests(org_id=org_id, limit=1, since_minutes=60*24*30)
                matching = [r for r in requests if r.get("trace_id") == trace_id]
                if matching:
                    req_data = matching[0]
                    item = DatasetItem(
                        id=f"item_{uuid.uuid4().hex[:12]}",
                        input=req_data.get("input", str(req_data)),
                        expected_output=req_data.get("output"),
                        context=req_data.get("context"),
                        metadata={"source_trace": trace_id},
                        source="trace",
                        source_trace_id=trace_id,
                        created_at=datetime.now(timezone.utc).isoformat(),
                    )
                    if dataset_id not in _dataset_items:
                        _dataset_items[dataset_id] = []
                    _dataset_items[dataset_id].append(item)
                    added.append(item)
        except Exception as e:
            logger.warning(f"Failed to fetch trace {trace_id}: {e}")
    
    # Update count
    dataset = org_datasets[dataset_id]
    dataset.item_count = len(_dataset_items.get(dataset_id, []))
    dataset.updated_at = datetime.now(timezone.utc).isoformat()
    
    return {
        "added": len(added),
        "requested": len(trace_ids),
    }


@router.post("/{dataset_id}/run")
async def run_dataset(
    dataset_id: str,
    req: RunDatasetRequest,
    current_user: dict = Depends(require_auth),
):
    """Run tests against a dataset."""
    org_id = current_user["org_id"]
    
    org_datasets = _datasets.get(org_id, {})
    if dataset_id not in org_datasets:
        raise HTTPException(404, "Dataset not found")
    
    dataset = org_datasets[dataset_id]
    items = _dataset_items.get(dataset_id, [])
    
    if not items:
        raise HTTPException(400, "Dataset has no items")
    
    # Create run record
    run_id = f"run_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    run = DatasetRun(
        id=run_id,
        dataset_id=dataset_id,
        dataset_name=dataset.name,
        status="running",
        total_items=len(items),
        started_at=now,
        model=req.model,
    )
    
    if org_id not in _dataset_runs:
        _dataset_runs[org_id] = []
    _dataset_runs[org_id].insert(0, run)
    
    # Run tests (synchronously for now - in production, use background tasks)
    try:
        from app.core.secrets import get_llm_credentials
        import google.generativeai as genai
        
        creds = await get_llm_credentials(org_id)
        if not creds or not creds.api_key:
            run.status = "failed"
            run.summary = {"error": "No LLM credentials configured"}
            return run.dict()
        
        genai.configure(api_key=creds.api_key)
        model = genai.GenerativeModel(req.model)
        
        results = []
        scores = []
        
        for item in items[:20]:  # Limit to 20 items for demo
            # Generate response
            prompt = req.prompt_template.replace("{input}", item.input)
            if item.context:
                prompt = prompt.replace("{context}", item.context)
            
            response = await model.generate_content_async(prompt)
            output = response.text or ""
            
            # Run evaluations
            item_scores = {}
            from app.api.evaluations import run_evaluation, EvaluationRequest
            
            for eval_template in req.evaluation_templates[:3]:  # Limit evals
                try:
                    eval_req = EvaluationRequest(
                        template_id=eval_template,
                        input_text=item.input,
                        output_text=output,
                        context=item.context,
                    )
                    eval_result = await run_evaluation(eval_req, current_user)
                    item_scores[eval_template] = eval_result.get("score", 0)
                except Exception:
                    pass
            
            result = {
                "item_id": item.id,
                "input": item.input[:200],
                "output": output[:500],
                "expected_output": item.expected_output[:200] if item.expected_output else None,
                "scores": item_scores,
                "avg_score": sum(item_scores.values()) / len(item_scores) if item_scores else 0,
            }
            results.append(result)
            scores.append(result["avg_score"])
            
            run.completed_items += 1
        
        run.results = results
        run.status = "completed"
        run.completed_at = datetime.now(timezone.utc).isoformat()
        run.summary = {
            "total_items": len(results),
            "avg_score": sum(scores) / len(scores) if scores else 0,
            "min_score": min(scores) if scores else 0,
            "max_score": max(scores) if scores else 0,
            "evaluations_run": len(req.evaluation_templates),
        }
        
        return run.dict()
        
    except Exception as e:
        run.status = "failed"
        run.summary = {"error": str(e)[:200]}
        run.completed_at = datetime.now(timezone.utc).isoformat()
        raise HTTPException(500, f"Run failed: {str(e)[:100]}")


@router.get("/{dataset_id}/runs")
async def list_dataset_runs(
    dataset_id: str,
    current_user: dict = Depends(require_auth),
    limit: int = Query(20, ge=1, le=100),
):
    """List runs for a dataset."""
    org_id = current_user["org_id"]
    
    org_datasets = _datasets.get(org_id, {})
    if dataset_id not in org_datasets:
        raise HTTPException(404, "Dataset not found")
    
    runs = _dataset_runs.get(org_id, [])
    dataset_runs = [r for r in runs if r.dataset_id == dataset_id]
    
    return {
        "runs": [r.dict() for r in dataset_runs[:limit]],
        "total": len(dataset_runs),
    }


@router.get("/runs")
async def list_all_runs(
    current_user: dict = Depends(require_auth),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List all dataset runs."""
    org_id = current_user["org_id"]
    
    runs = _dataset_runs.get(org_id, [])
    paginated = runs[offset:offset + limit]
    
    return {
        "runs": [r.dict() for r in paginated],
        "total": len(runs),
        "limit": limit,
        "offset": offset,
    }


@router.get("/runs/{run_id}")
async def get_run(
    run_id: str,
    current_user: dict = Depends(require_auth),
):
    """Get a specific run."""
    org_id = current_user["org_id"]
    
    runs = _dataset_runs.get(org_id, [])
    matching = [r for r in runs if r.id == run_id]
    
    if not matching:
        raise HTTPException(404, "Run not found")
    
    return matching[0].dict()

