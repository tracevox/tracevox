"""
LLM Observability Platform

A commercial LLM observability platform for monitoring, analyzing,
and optimizing LLM API usage.

Similar to: Helicone, LangSmith, Arize, Portkey

Features:
- LLM Proxy Gateway: Route API calls through us for logging
- Multi-tenant: Organizations with teams and permissions
- Analytics Dashboard: Usage, costs, latency, errors
- Alerts: Cost, error rate, latency thresholds
- Billing: Stripe integration with tiered pricing

Run with:
    uvicorn main:app --reload

Or:
    python main.py
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("llmobs")

# Import config
from app.core.config import config, Environment

# Import API routers
from app.api.auth import router as auth_router
from app.api.gateway import router as gateway_router
from app.api.dashboard import router as dashboard_router
from app.api.billing import router as billing_router
from app.api.keys import router as keys_router
from app.api.analytics import router as analytics_router
from app.api.credentials import router as credentials_router
from app.api.team import router as team_router
from app.api.alerts import router as alerts_router
from app.api.dashboards import router as dashboards_router
from app.api.sso import router as sso_router
from app.api.playground import router as playground_router
from app.api.templates import router as templates_router
from app.api.experiments import router as experiments_router
from app.api.export import router as export_router
from app.api.tracing import router as tracing_router
from app.api.evaluations import router as evaluations_router
from app.api.datasets import router as datasets_router
from app.api.admin import router as admin_router

# Import storage
from app.core.storage import dual_storage
from app.core.proxy import set_dual_storage_hook


# =============================================================================
# APPLICATION LIFESPAN
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown."""
    logger.info("=" * 60)
    logger.info("🚀 LLM Observability Platform Starting")
    logger.info(f"   Environment: {config.env.value}")
    logger.info(f"   Debug: {config.debug}")
    logger.info("=" * 60)
    
    # Initialize gateway
    from app.api.gateway import get_gateway
    gateway = get_gateway()
    
    # Initialize dual-write storage (Firestore + BigQuery)
    logger.info("Initializing dual-write storage...")
    await dual_storage.initialize()
    
    # Wire proxy to dual storage
    async def dual_storage_save_hook(log):
        await dual_storage.save_request_log(log)
    
    set_dual_storage_hook(dual_storage_save_hook)
    logger.info("✓ Dual-write storage initialized")
    
    yield
    
    # Cleanup
    logger.info("Shutting down...")
    await dual_storage.shutdown()
    await gateway.close()


# =============================================================================
# CREATE APPLICATION
# =============================================================================

app = FastAPI(
    title="Tracevox - LLM Observability Platform",
    description="""
    **Tracevox by Neuralrocks** - Monitor, analyze, and optimize your LLM API usage.
    
    ## Features
    - **Proxy Gateway**: Route your LLM calls through Tracevox for automatic logging
    - **Analytics**: Track costs, latency, and usage across all your models
    - **AI-Powered Triage**: Automatic root cause analysis and incident resolution
    - **SAFE Mode Security**: PII redaction, prompt injection detection, and content filtering
    - **Alerts**: Get notified when costs or error rates spike
    - **Team Management**: Collaborate with your team
    
    ## Quick Start
    1. Sign up at /auth/signup
    2. Create an API key at /api-keys
    3. Configure your LLM client to use our gateway (https://tracevox.ai/v1)
    """,
    version="2.0.0",
    docs_url="/docs" if config.debug else None,
    redoc_url="/redoc" if config.debug else None,
    lifespan=lifespan,
)


# =============================================================================
# MIDDLEWARE
# =============================================================================

# CORS - Allow frontend domains
cors_origins = os.getenv("CORS_ORIGINS", "").split(",") if os.getenv("CORS_ORIGINS") else []
if config.debug:
    cors_origins = ["*"]
elif not cors_origins:
    cors_origins = [
        config.app_url,
        "https://tracevox.ai",
        "https://www.tracevox.ai",
        "https://api.tracevox.ai",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request logging
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all requests."""
    start_time = __import__("time").time()
    
    response = await call_next(request)
    
    duration = __import__("time").time() - start_time
    
    # Skip logging for static files
    if not request.url.path.startswith("/assets"):
        logger.info(
            f"{request.method} {request.url.path} "
            f"- {response.status_code} ({duration*1000:.0f}ms)"
        )
    
    return response


# =============================================================================
# API ROUTES
# =============================================================================

# Authentication
app.include_router(auth_router, prefix="/api")

# API Keys management
app.include_router(keys_router, prefix="/api")

# Dashboard/Analytics
app.include_router(dashboard_router, prefix="/api")

# Billing
app.include_router(billing_router, prefix="/api")

# Analytics (BigQuery-powered)
app.include_router(analytics_router)

# Credentials (Secret Manager integration)
app.include_router(credentials_router, prefix="/api")

# Team Management
app.include_router(team_router, prefix="/api")

# Alert Integrations (Slack, PagerDuty, etc.)
app.include_router(alerts_router, prefix="/api")

# Custom Dashboards
app.include_router(dashboards_router, prefix="/api")

# SSO (SAML/OIDC)
app.include_router(sso_router, prefix="/api")

# Prompt Playground
app.include_router(playground_router, prefix="/api")

# Prompt Templates
app.include_router(templates_router, prefix="/api")

# A/B Experiments
app.include_router(experiments_router, prefix="/api")

# Data Export
app.include_router(export_router, prefix="/api")

# Tracing - Distributed tracing for LLM applications
app.include_router(tracing_router)

# Evaluations - Model-based evaluation and scoring
app.include_router(evaluations_router, prefix="/api")

# Datasets - Test datasets and regression testing
app.include_router(datasets_router, prefix="/api")

# Admin - Notification settings, user management
app.include_router(admin_router, prefix="/api")

# LLM Gateway (the proxy endpoints - no prefix, OpenAI-compatible)
app.include_router(gateway_router)


# =============================================================================
# CORE ROUTES
# =============================================================================

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": "2.0.0",
        "environment": config.env.value,
        "show_enterprise_features": config.show_enterprise_features,
    }


@app.get("/api")
async def api_info():
    """API information."""
    return {
        "name": "LLM Observability Platform API",
        "version": "2.0.0",
        "docs": "/docs" if config.debug else None,
        "gateway": {
            "openai": "/v1/chat/completions",
            "anthropic": "/anthropic/v1/messages",
            "google": "/google/v1/models/{model}:generateContent",
        },
        "storage": {
            "hot": "Firestore (real-time, 7 days)",
            "analytics": "BigQuery (historical, unlimited)",
        },
        "features": {
            "caching": "Automatic response caching for temperature=0 requests",
            "rate_limiting": "Tier-based rate limiting per org/key",
            "fallback": "Automatic failover between providers",
            "dual_write": "Async write to Firestore + BigQuery",
        },
        "endpoints": {
            "gateway": {
                "logs": "GET /api/logs",
                "rate_limit": "GET /api/rate-limit",
                "cache": "GET /api/cache",
                "providers": "GET /api/providers/status",
            },
            "analytics": {
                "summary": "GET /api/analytics/summary",
                "costs": "GET /api/analytics/costs",
                "costs_by_model": "GET /api/analytics/costs/by-model",
                "costs_by_day": "GET /api/analytics/costs/by-day",
                "costs_by_user": "GET /api/analytics/costs/by-user",
                "usage": "GET /api/analytics/usage",
                "usage_by_hour": "GET /api/analytics/usage/by-hour",
                "top_users": "GET /api/analytics/usage/top-users",
                "performance": "GET /api/analytics/performance",
                "latency": "GET /api/analytics/performance/latency",
                "errors": "GET /api/analytics/performance/errors",
                "security": "GET /api/analytics/security ⭐ DIFFERENTIATOR",
                "quality": "GET /api/analytics/quality ⭐ DIFFERENTIATOR",
                "compare": "GET /api/analytics/compare?period=month",
                "export": "GET /api/analytics/export?format=csv",
                "realtime": "GET /api/analytics/realtime",
                "custom_query": "POST /api/analytics/query",
            },
            "query_params": {
                "date_range": "?start=2025-01-01T00:00:00Z&end=2025-01-31T23:59:59Z",
                "or_days": "?days=30",
                "filters": "?model=gpt-4o&user_id=xxx",
                "pagination": "?limit=100&offset=0",
            },
        },
    }


# =============================================================================
# AI TRIAGE / CHAT ENDPOINT
# =============================================================================

import uuid
import time
import google.generativeai as genai
import httpx
from pydantic import BaseModel
from typing import Optional
from fastapi import Header

# Import secrets for stored credentials
from app.core.secrets import get_llm_credentials, LLMProvider

# Configure fallback Gemini (only used if org has no stored credentials)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

DEFAULT_MODEL = os.getenv("MODEL_NAME", "gemini-2.0-flash")


class ChatRequest(BaseModel):
    message: str
    safe_mode: bool = False
    session_id: Optional[str] = None


class TokenUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class CostEstimate(BaseModel):
    input_cost_usd: float = 0.0
    output_cost_usd: float = 0.0
    total_cost_usd: float = 0.0


class ChatResponse(BaseModel):
    request_id: str
    answer: str
    safe_mode: bool
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    latency_ms: int = 0
    model: str = DEFAULT_MODEL
    tokens: Optional[TokenUsage] = None
    cost: Optional[CostEstimate] = None
    provider: Optional[str] = None


# Pricing for cost calculation (per 1K tokens)
PRICING = {
    # Google Gemini
    "gemini-2.0-flash": {"input": 0.000075, "output": 0.0003},
    "gemini-1.5-pro-latest": {"input": 0.00125, "output": 0.005},
    "gemini-2.0-flash-exp": {"input": 0.000075, "output": 0.0003},
    "gemini-pro": {"input": 0.0005, "output": 0.0015},
    "gemini-1.5-flash": {"input": 0.000075, "output": 0.0003},
    "gemini-1.5-pro": {"input": 0.00125, "output": 0.005},
    # OpenAI
    "gpt-4o": {"input": 0.0025, "output": 0.01},
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
    "gpt-4-turbo": {"input": 0.01, "output": 0.03},
    "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
    # Anthropic
    "claude-3-opus-20240229": {"input": 0.015, "output": 0.075},
    "claude-3-sonnet-20240229": {"input": 0.003, "output": 0.015},
    "claude-3-haiku-20240307": {"input": 0.00025, "output": 0.00125},
    "claude-3-5-sonnet-20241022": {"input": 0.003, "output": 0.015},
}


def calculate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> dict:
    """Calculate cost based on model pricing."""
    rates = PRICING.get(model, {"input": 0.001, "output": 0.002})
    input_cost = (prompt_tokens / 1000) * rates["input"]
    output_cost = (completion_tokens / 1000) * rates["output"]
    return {
        "input_cost_usd": input_cost,
        "output_cost_usd": output_cost,
        "total_cost_usd": input_cost + output_cost,
    }


async def call_openai(api_key: str, model: str, prompt: str) -> tuple:
    """Call OpenAI API."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 2048,
            },
        )
        response.raise_for_status()
        data = response.json()
        
        text = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        return text, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)


async def call_anthropic(api_key: str, model: str, prompt: str) -> tuple:
    """Call Anthropic API."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": model,
                "max_tokens": 2048,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        response.raise_for_status()
        data = response.json()
        
        text = data["content"][0]["text"]
        usage = data.get("usage", {})
        return text, usage.get("input_tokens", 0), usage.get("output_tokens", 0)


async def call_google(api_key: str, model: str, prompt: str) -> tuple:
    """Call Google Gemini API."""
    # Configure genai with the user's API key
    genai.configure(api_key=api_key)
    
    gemini_model = genai.GenerativeModel(model)
    response = gemini_model.generate_content(prompt)
    
    text = response.text or ""
    prompt_tokens = 0
    completion_tokens = 0
    
    if hasattr(response, 'usage_metadata') and response.usage_metadata:
        prompt_tokens = getattr(response.usage_metadata, 'prompt_token_count', 0) or 0
        completion_tokens = getattr(response.usage_metadata, 'candidates_token_count', 0) or 0
    
    return text, prompt_tokens, completion_tokens


@app.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    authorization: Optional[str] = Header(None),
):
    """
    AI Triage endpoint - uses organization's stored LLM credentials.
    
    If the user is authenticated, their organization's stored credentials are used.
    Otherwise, falls back to the system default (Gemini).
    """
    request_id = str(uuid.uuid4())
    t0 = time.time()
    
    prompt_tokens = 0
    completion_tokens = 0
    response_text = ""
    provider_used = "google"
    model_used = DEFAULT_MODEL
    
    # Try to get user's org credentials
    org_credentials = None
    org_id = None
    
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        # Try to get org_id from session
        try:
            from app.api.auth import get_session
            session = get_session(token)  # get_session is synchronous
            if session:
                org_id = session.get("org_id")
                logger.info(f"Found org_id from session: {org_id}")
                if org_id:
                    org_credentials = await get_llm_credentials(org_id)
                    logger.info(f"Retrieved credentials for org {org_id}: {org_credentials is not None}")
        except Exception as e:
            logger.warning(f"Failed to get credentials from session: {e}")
    
    # Determine which credentials to use
    api_key = None
    provider = None
    model = DEFAULT_MODEL
    
    if org_credentials:
        api_key = org_credentials.api_key
        provider = org_credentials.provider.value if hasattr(org_credentials.provider, 'value') else org_credentials.provider
        model = org_credentials.default_model
        provider_used = provider
        model_used = model
        logger.info(f"Using stored credentials for org {org_id}: provider={provider}, model={model}")
    elif GEMINI_API_KEY:
        api_key = GEMINI_API_KEY
        provider = "google"
        model = DEFAULT_MODEL
        logger.info("Using fallback Gemini credentials")
    else:
        # No credentials available
        response_text = """**LLM Credentials Not Configured**

To enable AI Triage, please configure your LLM credentials in Settings.

**Steps:**
1. Go to Settings → LLM Configuration
2. Select your provider (OpenAI, Anthropic, or Google)
3. Enter your API key
4. Save your configuration

Your credentials are stored securely with enterprise-grade encryption.

**Supported Providers:**
- OpenAI (GPT-4o, GPT-4 Turbo, GPT-3.5)
- Anthropic (Claude 3 Opus, Sonnet, Haiku)
- Google (Gemini 2.0, Gemini 1.5)
"""
        latency_ms = int((time.time() - t0) * 1000)
        return ChatResponse(
            request_id=request_id,
            answer=response_text,
            safe_mode=req.safe_mode,
            trace_id=request_id[:16],
            span_id=request_id[16:24],
            latency_ms=latency_ms,
            model=model_used,
            tokens=TokenUsage(),
            cost=CostEstimate(),
            provider=provider_used,
        )
    
    # SAFE mode: Apply content filtering and redaction
    user_message = req.message
    if req.safe_mode:
        import re
        # Redact potential PII patterns
        user_message = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[EMAIL_REDACTED]', user_message)
        user_message = re.sub(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', '[PHONE_REDACTED]', user_message)
        user_message = re.sub(r'\b\d{16}\b', '[CARD_REDACTED]', user_message)
        user_message = re.sub(r'\b\d{3}-\d{2}-\d{4}\b', '[SSN_REDACTED]', user_message)
        # Redact API keys
        user_message = re.sub(r'(sk-|api[-_]?key[:\s]*)[A-Za-z0-9-_]{20,}', r'\1[KEY_REDACTED]', user_message, flags=re.IGNORECASE)
        logger.info("SAFE mode: Applied content redaction")
    
    # Build the prompt
    mode = "SAFE MODE - PII redacted, content filtered" if req.safe_mode else "NORMAL MODE"
    prompt = f"""You are Tracevox AI Triage Assistant - an expert in LLM observability and incident analysis.
Mode: {mode}

{'⚠️ SAFE MODE ACTIVE: Responses are filtered for sensitive content.' if req.safe_mode else ''}

Analyze the following and provide actionable insights:
{user_message}

Format your response with:
1. **Root Cause Hypothesis** - Most likely cause
2. **Key Metrics to Check** - What to investigate
3. **Recommended Actions** - Steps to resolve
4. **Prevention** - How to avoid in future

Be concise but thorough. Use bullet points and code snippets where helpful.
{'Note: In SAFE mode, avoid including any potentially sensitive information, API keys, or PII in your response.' if req.safe_mode else ''}"""

    try:
        if provider == "openai":
            response_text, prompt_tokens, completion_tokens = await call_openai(api_key, model, prompt)
        elif provider == "anthropic":
            response_text, prompt_tokens, completion_tokens = await call_anthropic(api_key, model, prompt)
        elif provider == "google":
            response_text, prompt_tokens, completion_tokens = await call_google(api_key, model, prompt)
        else:
            # Default to Google/Gemini
            response_text, prompt_tokens, completion_tokens = await call_google(api_key, model, prompt)
            
    except Exception as e:
        logger.error(f"LLM API error ({provider}): {e}")
        response_text = f"""**AI Triage Error**

An error occurred while analyzing with {provider}: {str(e)[:200]}

**Troubleshooting:**
1. Verify your API key is valid in Settings
2. Check if you have sufficient credits/quota
3. Try again in a few seconds

**Manual Analysis Tips:**
- Check recent error logs in the dashboard
- Review latency trends for anomalies
- Verify provider connectivity status
"""
    
    latency_ms = int((time.time() - t0) * 1000)
    cost_data = calculate_cost(model, prompt_tokens, completion_tokens)
    
    return ChatResponse(
        request_id=request_id,
        answer=response_text,
        safe_mode=req.safe_mode,
        trace_id=request_id[:16],
        span_id=request_id[16:24],
        latency_ms=latency_ms,
        model=model_used,
        tokens=TokenUsage(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
        ),
        cost=CostEstimate(**cost_data),
        provider=provider_used,
    )


# =============================================================================
# STATIC FILES / FRONTEND
# =============================================================================

import pathlib

# Check for frontend build
FRONTEND_DIR = pathlib.Path(__file__).parent / "frontend" / "dist"
STATIC_DIR = pathlib.Path(__file__).parent / "static"

if FRONTEND_DIR.exists():
    # Serve React frontend
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets")
    
    @app.get("/{path:path}")
    async def serve_frontend(path: str):
        """Serve the React frontend."""
        # API routes are handled above
        if path.startswith("api/") or path.startswith("v1/") or path.startswith("anthropic/"):
            return JSONResponse({"error": "Not found"}, status_code=404)
        
        index_path = FRONTEND_DIR / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))
        return JSONResponse({"error": "Frontend not found"}, status_code=404)

elif STATIC_DIR.exists():
    # Serve legacy static files
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
    
    @app.get("/")
    async def root():
        """Serve index page."""
        index_path = STATIC_DIR / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))
        return JSONResponse({
            "message": "LLM Observability Platform",
            "docs": "/docs",
            "health": "/health",
        })

else:
    @app.get("/")
    async def root():
        """Root endpoint when no frontend."""
        return {
            "message": "LLM Observability Platform",
            "version": "2.0.0",
            "docs": "/docs" if config.debug else "See API documentation",
            "get_started": {
                "1_signup": "POST /api/auth/signup",
                "2_create_key": "POST /api/api-keys",
                "3_use_gateway": "POST /v1/chat/completions with X-Tracevox-Key header",
            },
        }


# =============================================================================
# RUN
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=config.debug,
        log_level="info",
    )

