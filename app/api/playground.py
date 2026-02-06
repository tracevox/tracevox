"""
Prompt Playground API

Test prompts directly in the UI with real-time feedback:
- Test against multiple models
- Compare responses side-by-side
- Track token usage and costs
- Save successful prompts as templates
"""

from __future__ import annotations
import logging
import uuid
import time
import os
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.auth import require_auth, get_db

logger = logging.getLogger("tracevox.playground")
router = APIRouter(prefix="/playground", tags=["Prompt Playground"])


# =============================================================================
# MODELS
# =============================================================================

class PlaygroundMessage(BaseModel):
    """A message in the conversation."""
    role: str = Field(..., description="Role: system, user, or assistant")
    content: str = Field(..., description="Message content")


class PlaygroundRequest(BaseModel):
    """Request to test a prompt."""
    messages: List[PlaygroundMessage]
    model: Optional[str] = Field(default=None, description="Model to use (defaults to stored credentials)")
    provider: Optional[str] = Field(default=None, description="Provider: openai, anthropic, google (defaults to stored credentials)")
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: int = Field(default=1024, ge=1, le=32000)
    top_p: float = Field(default=1.0, ge=0, le=1)
    # Optional parameters
    system_prompt: Optional[str] = None
    variables: Optional[Dict[str, str]] = None  # For template variable substitution
    custom_properties: Optional[Dict[str, Any]] = None  # Metadata tags


class PlaygroundResponse(BaseModel):
    """Response from playground test."""
    id: str
    content: str
    model: str
    provider: str
    tokens: Dict[str, int]
    cost: Dict[str, float]
    latency_ms: int
    finish_reason: Optional[str] = None
    # Metadata
    created_at: str
    custom_properties: Optional[Dict[str, Any]] = None


class CompareRequest(BaseModel):
    """Request to compare prompts across models."""
    messages: List[PlaygroundMessage]
    models: List[Dict[str, str]] = Field(..., description="List of {provider, model} dicts")
    temperature: float = Field(default=0.7)
    max_tokens: int = Field(default=1024)


class SaveAsTemplateRequest(BaseModel):
    """Save playground session as template."""
    name: str
    description: Optional[str] = None
    messages: List[PlaygroundMessage]
    variables: Optional[List[str]] = None  # Variable names like ["topic", "tone"]
    default_model: Optional[str] = None
    default_provider: Optional[str] = None


# =============================================================================
# PRICING
# =============================================================================

PRICING = {
    # OpenAI (per 1K tokens)
    "gpt-4o": {"input": 0.0025, "output": 0.01},
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
    "gpt-4-turbo": {"input": 0.01, "output": 0.03},
    "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
    # Anthropic
    "claude-3-opus-20240229": {"input": 0.015, "output": 0.075},
    "claude-3-sonnet-20240229": {"input": 0.003, "output": 0.015},
    "claude-3-haiku-20240307": {"input": 0.00025, "output": 0.00125},
    "claude-3-5-sonnet-20241022": {"input": 0.003, "output": 0.015},
    # Google (correct model names)
    "gemini-2.0-flash": {"input": 0.000075, "output": 0.0003},
    "gemini-2.0-flash-exp": {"input": 0.000075, "output": 0.0003},
    "gemini-1.5-flash": {"input": 0.000075, "output": 0.0003},
    "gemini-1.5-flash-latest": {"input": 0.000075, "output": 0.0003},
    "gemini-1.5-pro": {"input": 0.00125, "output": 0.005},
    "gemini-1.5-pro-latest": {"input": 0.00125, "output": 0.005},
    "gemini-pro": {"input": 0.0005, "output": 0.0015},
}


def calculate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> dict:
    """Calculate cost based on model pricing."""
    rates = PRICING.get(model, {"input": 0.001, "output": 0.002})
    input_cost = (prompt_tokens / 1000) * rates["input"]
    output_cost = (completion_tokens / 1000) * rates["output"]
    return {
        "input_cost_usd": round(input_cost, 6),
        "output_cost_usd": round(output_cost, 6),
        "total_cost_usd": round(input_cost + output_cost, 6),
    }


# =============================================================================
# LLM CLIENTS
# =============================================================================

async def call_openai(api_key: str, model: str, messages: list, temperature: float, max_tokens: int) -> tuple:
    """Call OpenAI API."""
    import httpx
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        )
        response.raise_for_status()
        data = response.json()
        
        text = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        finish_reason = data["choices"][0].get("finish_reason")
        return text, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), finish_reason


async def call_anthropic(api_key: str, model: str, messages: list, temperature: float, max_tokens: int) -> tuple:
    """Call Anthropic API."""
    import httpx
    
    # Extract system message if present
    system = None
    chat_messages = []
    for msg in messages:
        if msg["role"] == "system":
            system = msg["content"]
        else:
            chat_messages.append(msg)
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": chat_messages,
            "temperature": temperature,
        }
        if system:
            payload["system"] = system
            
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
            json=payload,
        )
        response.raise_for_status()
        data = response.json()
        
        text = data["content"][0]["text"]
        usage = data.get("usage", {})
        stop_reason = data.get("stop_reason")
        return text, usage.get("input_tokens", 0), usage.get("output_tokens", 0), stop_reason


async def call_google(api_key: str, model: str, messages: list, temperature: float, max_tokens: int) -> tuple:
    """Call Google Gemini API."""
    import google.generativeai as genai
    
    genai.configure(api_key=api_key)
    
    # Convert messages to Gemini format
    gemini_model = genai.GenerativeModel(model)
    
    # Build conversation
    prompt_parts = []
    for msg in messages:
        if msg["role"] == "system":
            prompt_parts.append(f"System: {msg['content']}\n\n")
        elif msg["role"] == "user":
            prompt_parts.append(f"User: {msg['content']}\n\n")
        elif msg["role"] == "assistant":
            prompt_parts.append(f"Assistant: {msg['content']}\n\n")
    
    prompt = "".join(prompt_parts) + "Assistant: "
    
    response = gemini_model.generate_content(
        prompt,
        generation_config={
            "temperature": temperature,
            "max_output_tokens": max_tokens,
        }
    )
    
    text = response.text or ""
    prompt_tokens = 0
    completion_tokens = 0
    
    if hasattr(response, 'usage_metadata') and response.usage_metadata:
        prompt_tokens = getattr(response.usage_metadata, 'prompt_token_count', 0) or 0
        completion_tokens = getattr(response.usage_metadata, 'candidates_token_count', 0) or 0
    
    return text, prompt_tokens, completion_tokens, "stop"


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.post("/run", response_model=PlaygroundResponse)
async def run_playground(
    request: PlaygroundRequest,
    current_user: dict = Depends(require_auth),
):
    """
    Run a prompt in the playground.
    Uses the organization's stored LLM credentials.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    
    # Get stored credentials
    from app.core.secrets import get_llm_credentials
    credentials = await get_llm_credentials(org_id)
    
    if not credentials:
        raise HTTPException(400, "No LLM credentials configured. Go to Settings to add your API key.")
    
    # Prepare messages
    messages = [{"role": m.role, "content": m.content} for m in request.messages]
    
    # Add system prompt if provided
    if request.system_prompt:
        messages.insert(0, {"role": "system", "content": request.system_prompt})
    
    # Variable substitution
    if request.variables:
        for msg in messages:
            for var_name, var_value in request.variables.items():
                msg["content"] = msg["content"].replace(f"{{{{{var_name}}}}}", var_value)
    
    # Determine provider and model from stored credentials (with optional override)
    # Convert enum to string if needed
    stored_provider = credentials.provider.value if hasattr(credentials.provider, 'value') else credentials.provider
    
    provider = request.provider if request.provider else stored_provider
    model = request.model if request.model else credentials.default_model
    api_key = credentials.api_key
    
    logger.info(f"Playground using provider={provider}, model={model}")
    
    t0 = time.time()
    
    try:
        if provider == "openai":
            text, prompt_tokens, completion_tokens, finish_reason = await call_openai(
                api_key, model, messages, request.temperature, request.max_tokens
            )
        elif provider == "anthropic":
            text, prompt_tokens, completion_tokens, finish_reason = await call_anthropic(
                api_key, model, messages, request.temperature, request.max_tokens
            )
        elif provider == "google":
            text, prompt_tokens, completion_tokens, finish_reason = await call_google(
                api_key, model, messages, request.temperature, request.max_tokens
            )
        else:
            raise HTTPException(400, f"Unsupported provider: {provider}")
            
    except Exception as e:
        logger.error(f"Playground error: {e}")
        raise HTTPException(500, f"LLM API error: {str(e)[:200]}")
    
    latency_ms = int((time.time() - t0) * 1000)
    cost = calculate_cost(model, prompt_tokens, completion_tokens)
    
    # Log to Firestore for history
    db = get_db()
    if db:
        try:
            db.collection("playground_history").add({
                "org_id": org_id,
                "user_id": user_id,
                "messages": messages,
                "response": text,
                "model": model,
                "provider": provider,
                "tokens": {"prompt": prompt_tokens, "completion": completion_tokens},
                "cost": cost,
                "latency_ms": latency_ms,
                "custom_properties": request.custom_properties,
                "created_at": datetime.now(timezone.utc),
            })
        except Exception as e:
            logger.warning(f"Failed to log playground history: {e}")
    
    return PlaygroundResponse(
        id=str(uuid.uuid4()),
        content=text,
        model=model,
        provider=provider,
        tokens={
            "prompt": prompt_tokens,
            "completion": completion_tokens,
            "total": prompt_tokens + completion_tokens,
        },
        cost=cost,
        latency_ms=latency_ms,
        finish_reason=finish_reason,
        created_at=datetime.now(timezone.utc).isoformat(),
        custom_properties=request.custom_properties,
    )


@router.post("/compare")
async def compare_models(
    request: CompareRequest,
    current_user: dict = Depends(require_auth),
):
    """
    Compare the same prompt across multiple models.
    Returns responses from all models for side-by-side comparison.
    """
    org_id = current_user["org_id"]
    
    # Get stored credentials
    from app.core.secrets import get_llm_credentials
    credentials = await get_llm_credentials(org_id)
    
    if not credentials:
        raise HTTPException(400, "No LLM credentials configured.")
    
    messages = [{"role": m.role, "content": m.content} for m in request.messages]
    results = []
    
    for model_config in request.models:
        provider = model_config.get("provider", "openai")
        model = model_config.get("model", "gpt-4o-mini")
        
        t0 = time.time()
        try:
            if provider == "openai":
                text, prompt_tokens, completion_tokens, finish_reason = await call_openai(
                    credentials.api_key, model, messages, request.temperature, request.max_tokens
                )
            elif provider == "anthropic":
                text, prompt_tokens, completion_tokens, finish_reason = await call_anthropic(
                    credentials.api_key, model, messages, request.temperature, request.max_tokens
                )
            elif provider == "google":
                text, prompt_tokens, completion_tokens, finish_reason = await call_google(
                    credentials.api_key, model, messages, request.temperature, request.max_tokens
                )
            else:
                text = f"Unsupported provider: {provider}"
                prompt_tokens = completion_tokens = 0
                finish_reason = "error"
                
            latency_ms = int((time.time() - t0) * 1000)
            cost = calculate_cost(model, prompt_tokens, completion_tokens)
            
            results.append({
                "model": model,
                "provider": provider,
                "content": text,
                "tokens": {"prompt": prompt_tokens, "completion": completion_tokens},
                "cost": cost,
                "latency_ms": latency_ms,
                "finish_reason": finish_reason,
                "error": None,
            })
            
        except Exception as e:
            results.append({
                "model": model,
                "provider": provider,
                "content": None,
                "tokens": None,
                "cost": None,
                "latency_ms": int((time.time() - t0) * 1000),
                "finish_reason": "error",
                "error": str(e)[:200],
            })
    
    return {"results": results}


@router.get("/history")
async def get_playground_history(
    limit: int = 50,
    current_user: dict = Depends(require_auth),
):
    """
    Get playground history for the user.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    
    db = get_db()
    if not db:
        return {"history": []}
    
    try:
        query = (
            db.collection("playground_history")
            .where("org_id", "==", org_id)
            .where("user_id", "==", user_id)
            .order_by("created_at", direction="DESCENDING")
            .limit(limit)
        )
        
        history = []
        for doc in query.stream():
            data = doc.to_dict()
            data["id"] = doc.id
            if data.get("created_at"):
                data["created_at"] = data["created_at"].isoformat()
            history.append(data)
        
        return {"history": history}
        
    except Exception as e:
        logger.error(f"Failed to get playground history: {e}")
        return {"history": [], "error": str(e)}


@router.post("/save-as-template")
async def save_as_template(
    request: SaveAsTemplateRequest,
    current_user: dict = Depends(require_auth),
):
    """
    Save a playground session as a reusable template.
    """
    org_id = current_user["org_id"]
    user_id = current_user["user"]["id"]
    
    db = get_db()
    if not db:
        raise HTTPException(503, "Database not available")
    
    template_data = {
        "org_id": org_id,
        "created_by": user_id,
        "name": request.name,
        "description": request.description,
        "messages": [{"role": m.role, "content": m.content} for m in request.messages],
        "variables": request.variables or [],
        "default_model": request.default_model,
        "default_provider": request.default_provider,
        "version": 1,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    
    template_ref = db.collection("prompt_templates").add(template_data)
    
    return {
        "success": True,
        "template_id": template_ref[1].id,
        "name": request.name,
    }


@router.get("/models")
async def get_available_models():
    """
    Get list of available models for the playground.
    """
    return {
        "providers": [
            {
                "id": "openai",
                "name": "OpenAI",
                "models": [
                    {"id": "gpt-4o", "name": "GPT-4o", "context": 128000},
                    {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "context": 128000},
                    {"id": "gpt-4-turbo", "name": "GPT-4 Turbo", "context": 128000},
                    {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo", "context": 16385},
                ],
            },
            {
                "id": "anthropic",
                "name": "Anthropic",
                "models": [
                    {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet", "context": 200000},
                    {"id": "claude-3-opus-20240229", "name": "Claude 3 Opus", "context": 200000},
                    {"id": "claude-3-sonnet-20240229", "name": "Claude 3 Sonnet", "context": 200000},
                    {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku", "context": 200000},
                ],
            },
            {
                "id": "google",
                "name": "Google",
                "models": [
                    {"id": "gemini-2.0-flash-exp", "name": "Gemini 2.0 Flash (Exp)", "context": 1000000},
                    {"id": "gemini-1.5-flash-latest", "name": "Gemini 1.5 Flash", "context": 1000000},
                    {"id": "gemini-1.5-pro-latest", "name": "Gemini 1.5 Pro", "context": 1000000},
                    {"id": "gemini-pro", "name": "Gemini Pro", "context": 32000},
                ],
            },
        ],
        "pricing": PRICING,
    }

