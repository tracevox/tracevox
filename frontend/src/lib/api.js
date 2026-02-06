/**
 * Tracevox API Client
 * 
 * Complete API client for all backend endpoints.
 * Commercial-grade implementation for enterprise customers.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.tracevox.ai';

// Token storage keys
const TOKEN_KEY = 'tracevox_token';
const USER_KEY = 'tracevox_user';
const ORG_KEY = 'tracevox_org';

// =============================================================================
// TOKEN MANAGEMENT
// =============================================================================

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  const user = localStorage.getItem(USER_KEY);
  return user ? JSON.parse(user) : null;
}

export function getOrg() {
  const org = localStorage.getItem(ORG_KEY);
  return org ? JSON.parse(org) : null;
}

export function isAuthenticated() {
  return !!getToken();
}

function storeAuthData(data) {
  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  localStorage.setItem(ORG_KEY, JSON.stringify(data.organization));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ORG_KEY);
}

// =============================================================================
// API REQUEST HELPER
// =============================================================================

async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  
  // Handle 401 - token expired or invalid
  // Only redirect for auth endpoints, not analytics (which may require API key)
  if (response.status === 401) {
    const isAuthEndpoint = endpoint.includes('/auth/') || endpoint.includes('/dashboard/') || endpoint.includes('/billing/') || endpoint.includes('/api-keys');
    if (isAuthEndpoint) {
    clearAuth();
    window.location.href = '/';
    throw new Error('Session expired. Please log in again.');
    }
    // For analytics endpoints, just throw error (let caller handle it)
    throw new Error('Authentication required');
  }
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.detail || data.message || data.error?.message || 'Request failed');
  }
  
  return data;
}

function buildQuery(params) {
  const filtered = Object.entries(params || {}).filter(([_, v]) => v != null);
  if (filtered.length === 0) return '';
  return '?' + new URLSearchParams(filtered).toString();
}

// Helper for POST requests
export async function apiPost(endpoint, body = {}) {
  return apiRequest(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// Helper for PATCH requests
export async function apiPatch(endpoint, body = {}) {
  return apiRequest(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

// Helper for DELETE requests
export async function apiDelete(endpoint) {
  return apiRequest(endpoint, {
    method: 'DELETE',
  });
}

// Export apiRequest for direct use
export { apiRequest };

// =============================================================================
// FEATURE FLAGS / HEALTH (no auth required)
// =============================================================================

let _healthCache = null;

/**
 * Fetch health/feature flags. Used to know if enterprise features should be shown
 * or displayed as "Under development". Cached per session.
 */
export async function getHealth() {
  if (_healthCache) return _healthCache;
  const response = await fetch(`${API_BASE_URL}/health`);
  const data = await response.json();
  _healthCache = data;
  return data;
}

// =============================================================================
// AUTHENTICATION
// =============================================================================

export async function signup({ email, password, name, company }) {
  const data = await apiRequest('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      name,
      company_name: company || null,
    }),
  });
  storeAuthData(data);
  return data;
}

export async function login({ email, password }) {
  const data = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  storeAuthData(data);
  return data;
}

export async function logout() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch (e) {
    // Ignore errors on logout
  }
  clearAuth();
}

export async function getCurrentUser() {
  return apiRequest('/api/auth/me');
}

// =============================================================================
// API KEYS
// =============================================================================

export async function listApiKeys() {
  return apiRequest('/api/api-keys');
}

export async function createApiKey({ name, environment = 'production' }) {
  return apiRequest('/api/api-keys', {
    method: 'POST',
    body: JSON.stringify({ name, environment }),
  });
}

export async function revokeApiKey(keyId) {
  return apiRequest(`/api/api-keys/${keyId}`, { method: 'DELETE' });
}

// =============================================================================
// DASHBOARD
// =============================================================================

export async function getDashboardOverview(params = {}) {
  return apiRequest(`/api/dashboard/overview${buildQuery(params)}`);
}

export async function getDashboardTimeseries(params = {}) {
  return apiRequest(`/api/dashboard/timeseries${buildQuery(params)}`);
}

export async function getDashboardRequests(params = {}) {
  return apiRequest(`/api/dashboard/requests${buildQuery(params)}`);
}

export async function getModelBreakdown(params = {}) {
  return apiRequest(`/api/dashboard/models${buildQuery(params)}`);
}

export async function getAlerts(params = {}) {
  return apiRequest(`/api/dashboard/alerts${buildQuery(params)}`);
}

export async function getCostForecast(params = {}) {
  return apiRequest(`/api/dashboard/cost-forecast${buildQuery(params)}`);
}

// =============================================================================
// ANALYTICS - SUMMARY
// =============================================================================

export async function getAnalyticsSummary(params = {}) {
  return apiRequest(`/api/analytics/summary${buildQuery(params)}`);
}

// =============================================================================
// ANALYTICS - COSTS
// =============================================================================

export async function getCostAnalytics(params = {}) {
  return apiRequest(`/api/analytics/costs${buildQuery(params)}`);
}

export async function getCostsByModel(params = {}) {
  return apiRequest(`/api/analytics/costs/by-model${buildQuery(params)}`);
}

export async function getCostsByDay(params = {}) {
  return apiRequest(`/api/analytics/costs/by-day${buildQuery(params)}`);
}

export async function getCostsByUser(params = {}) {
  return apiRequest(`/api/analytics/costs/by-user${buildQuery(params)}`);
}

// =============================================================================
// ANALYTICS - USAGE
// =============================================================================

export async function getUsageAnalytics(params = {}) {
  return apiRequest(`/api/analytics/usage${buildQuery(params)}`);
}

export async function getUsageByHour(params = {}) {
  return apiRequest(`/api/analytics/usage/by-hour${buildQuery(params)}`);
}

export async function getTopUsers(params = {}) {
  return apiRequest(`/api/analytics/usage/top-users${buildQuery(params)}`);
}

// =============================================================================
// ANALYTICS - PERFORMANCE
// =============================================================================

export async function getPerformanceAnalytics(params = {}) {
  return apiRequest(`/api/analytics/performance${buildQuery(params)}`);
}

export async function getLatencyPercentiles(params = {}) {
  return apiRequest(`/api/analytics/performance/latency${buildQuery(params)}`);
}

export async function getErrorBreakdown(params = {}) {
  return apiRequest(`/api/analytics/performance/errors${buildQuery(params)}`);
}

// =============================================================================
// ANALYTICS - SECURITY (DIFFERENTIATOR)
// =============================================================================

export async function getSecurityAnalytics(params = {}) {
  return apiRequest(`/api/analytics/security${buildQuery(params)}`);
}

// =============================================================================
// ANALYTICS - QUALITY (DIFFERENTIATOR)
// =============================================================================

export async function getQualityAnalytics(params = {}) {
  return apiRequest(`/api/analytics/quality${buildQuery(params)}`);
}

// =============================================================================
// ANALYTICS - COMPARE
// =============================================================================

export async function getComparison(params = {}) {
  return apiRequest(`/api/analytics/compare${buildQuery(params)}`);
}

// =============================================================================
// ANALYTICS - REAL-TIME
// =============================================================================

export async function getRealtimeMetrics(params = {}) {
  return apiRequest(`/api/analytics/realtime${buildQuery(params)}`);
}

export async function getRealtimeLogs(params = {}) {
  return apiRequest(`/api/analytics/realtime/logs${buildQuery(params)}`);
}

// =============================================================================
// ANALYTICS - EXPORT
// =============================================================================

export async function exportAnalytics(params = {}) {
  return apiRequest(`/api/analytics/export${buildQuery(params)}`);
}

// =============================================================================
// ANALYTICS - CUSTOM QUERY
// =============================================================================

export async function runCustomQuery(sql) {
  return apiRequest('/api/analytics/query', {
    method: 'POST',
    body: JSON.stringify({ sql }),
  });
}

// =============================================================================
// BILLING
// =============================================================================

export async function getBillingInfo() {
  return apiRequest('/api/billing/info');
}

export async function getUsage() {
  return apiRequest('/api/billing/usage');
}

export async function getPricingPlans() {
  return apiRequest('/api/billing/plans');
}

export async function createCheckoutSession(priceId, billingPeriod = 'monthly') {
  return apiRequest('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ price_id: priceId, billing_period: billingPeriod }),
  });
}

export async function getBillingPortal() {
  return apiRequest('/api/billing/portal', { method: 'POST' });
}

export async function getInvoices() {
  return apiRequest('/api/billing/invoices');
}

export async function cancelSubscription() {
  return apiRequest('/api/billing/cancel', { method: 'POST' });
}

// =============================================================================
// GATEWAY LOGS
// =============================================================================

export async function getGatewayLogs(params = {}) {
  return apiRequest(`/api/logs${buildQuery(params)}`);
}

export async function getRateLimitInfo() {
  return apiRequest('/api/rate-limit');
}

export async function getCacheStats() {
  return apiRequest('/api/cache');
}

export async function getProviderStatus() {
  return apiRequest('/api/providers/status');
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

export async function healthCheck() {
  const response = await fetch(`${API_BASE_URL}/health`);
  return response.json();
}

// =============================================================================
// AI INSIGHTS (uses analytics data to generate insights)
// =============================================================================

export async function getAIInsights(params = {}) {
  // Call the LLM-powered backend endpoint for intelligent AI analysis
  // This uses Gemini to analyze metrics and generate proactive insights
  try {
    const data = await apiRequest(`/api/dashboard/ai-insights${buildQuery(params)}`);
    return data;
  } catch (err) {
    console.error("Failed to fetch AI insights:", err);
    // Return a minimal response on error
    return {
      health_score: 100,
      risk_level: 'low',
      insights: [{ type: 'info', title: 'Analysis Unavailable', detail: 'Unable to fetch AI insights. Please try again.', severity: 'info' }],
      predictions: [],
      recommendations: [],
      metrics_snapshot: {},
      timestamp: new Date().toISOString(),
    };
  }
}

// =============================================================================
// AI TRIAGE / CHAT - Calls backend /chat endpoint (exactly like hackathon)
// =============================================================================

/**
 * AI Triage - Uses organization's stored LLM credentials
 * 
 * This endpoint uses credentials stored securely in Settings.
 * No need to pass API keys - the backend retrieves them from Secret Manager.
 * 
 * The user just needs to be authenticated (session token).
 */
export async function aiTriage({ 
  message, 
  safe_mode = false, 
}) {
  const token = getToken();
  
  if (!token) {
    throw new Error("Please log in to use AI Triage.");
  }

  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      message,
      safe_mode,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.message || `AI Triage failed: ${response.status}`);
  }

  return response.json();
}

// Cost calculation based on model pricing
function calculateCost(model, promptTokens, completionTokens) {
  const pricing = {
    "gpt-4o": { input: 0.0025, output: 0.01 },
    "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
    "gpt-4-turbo": { input: 0.01, output: 0.03 },
    "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
    "claude-3-opus": { input: 0.015, output: 0.075 },
    "claude-3-sonnet": { input: 0.003, output: 0.015 },
    "claude-3-haiku": { input: 0.00025, output: 0.00125 },
    "gemini-2.0-flash": { input: 0.000075, output: 0.0003 },
    "gemini-1.5-pro": { input: 0.00125, output: 0.005 },
    "gemini-2.5-pro": { input: 0.00125, output: 0.005 },
  };
  const rates = pricing[model] || pricing["gpt-4o-mini"];
  return (promptTokens / 1000) * rates.input + (completionTokens / 1000) * rates.output;
}

// =============================================================================
// LLM CREDENTIALS MANAGEMENT
// =============================================================================

/**
 * Get supported LLM providers
 */
export async function getProviders() {
  return apiRequest('/api/credentials/providers');
}

/**
 * Get current LLM credential configuration (without the actual API key)
 */
export async function getCredentialConfig() {
  return apiRequest('/api/credentials');
}

/**
 * Save LLM credentials
 */
export async function saveCredentials({ provider, api_key, default_model, endpoint_url }) {
  return apiRequest('/api/credentials', {
    method: 'POST',
    body: JSON.stringify({ provider, api_key, default_model, endpoint_url }),
  });
}

/**
 * Validate LLM credentials (test without saving)
 */
export async function validateCredentials({ provider, api_key, default_model, endpoint_url }) {
  return apiRequest('/api/credentials/validate', {
    method: 'POST',
    body: JSON.stringify({ provider, api_key, default_model, endpoint_url }),
  });
}

/**
 * Delete LLM credentials
 */
export async function deleteCredentials() {
  return apiRequest('/api/credentials', {
    method: 'DELETE',
  });
}

/**
 * Test stored LLM credentials connection
 */
export async function testCredentialConnection() {
  return apiRequest('/api/credentials/test-connection');
}

/**
 * Get credential audit logs
 */
export async function getCredentialAuditLogs(limit = 50, action = null) {
  const params = { limit };
  if (action) params.action = action;
  return apiRequest(`/api/credentials/audit-logs${buildQuery(params)}`);
}

// =============================================================================
// PROMPT PLAYGROUND
// =============================================================================

export async function runPlayground(request) {
  return apiRequest('/api/playground/run', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function compareModels(request) {
  return apiRequest('/api/playground/compare', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getPlaygroundHistory(limit = 50) {
  return apiRequest(`/api/playground/history?limit=${limit}`);
}

export async function savePlaygroundAsTemplate(request) {
  return apiRequest('/api/playground/save-as-template', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getPlaygroundModels() {
  return apiRequest('/api/playground/models');
}

// =============================================================================
// PROMPT TEMPLATES
// =============================================================================

export async function listTemplates(options = {}) {
  const params = {};
  if (options.category) params.category = options.category;
  if (options.tag) params.tag = options.tag;
  if (options.search) params.search = options.search;
  return apiRequest(`/api/templates${buildQuery(params)}`);
}

export async function createTemplate(template) {
  return apiRequest('/api/templates', {
    method: 'POST',
    body: JSON.stringify(template),
  });
}

export async function getTemplate(templateId) {
  return apiRequest(`/api/templates/${templateId}`);
}

export async function updateTemplate(templateId, updates) {
  return apiRequest(`/api/templates/${templateId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteTemplate(templateId) {
  return apiRequest(`/api/templates/${templateId}`, { method: 'DELETE' });
}

export async function duplicateTemplate(templateId, name = null) {
  const params = name ? `?name=${encodeURIComponent(name)}` : '';
  return apiRequest(`/api/templates/${templateId}/duplicate${params}`, { method: 'POST' });
}

export async function getTemplateVersions(templateId) {
  return apiRequest(`/api/templates/${templateId}/versions`);
}

export async function rollbackTemplate(templateId, version) {
  return apiRequest(`/api/templates/${templateId}/rollback/${version}`, { method: 'POST' });
}

export async function getTemplateCategories() {
  return apiRequest('/api/templates/categories');
}

export async function recordTemplateUsage(templateId) {
  return apiRequest(`/api/templates/${templateId}/use`, { method: 'POST' });
}

// =============================================================================
// A/B EXPERIMENTS
// =============================================================================

export async function listExperiments(status = null) {
  const params = status ? `?status=${status}` : '';
  return apiRequest(`/api/experiments${params}`);
}

export async function createExperiment(experiment) {
  return apiRequest('/api/experiments', {
    method: 'POST',
    body: JSON.stringify(experiment),
  });
}

export async function getExperiment(experimentId) {
  return apiRequest(`/api/experiments/${experimentId}`);
}

export async function startExperiment(experimentId) {
  return apiRequest(`/api/experiments/${experimentId}/start`, { method: 'POST' });
}

export async function pauseExperiment(experimentId) {
  return apiRequest(`/api/experiments/${experimentId}/pause`, { method: 'POST' });
}

export async function completeExperiment(experimentId, winnerVariantId = null) {
  const params = winnerVariantId ? `?winner_variant_id=${winnerVariantId}` : '';
  return apiRequest(`/api/experiments/${experimentId}/complete${params}`, { method: 'POST' });
}

export async function assignVariant(experimentId) {
  return apiRequest(`/api/experiments/${experimentId}/assign`, { method: 'POST' });
}

export async function recordExperimentResult(experimentId, result) {
  return apiRequest(`/api/experiments/${experimentId}/record`, {
    method: 'POST',
    body: JSON.stringify(result),
  });
}

export async function deleteExperiment(experimentId) {
  return apiRequest(`/api/experiments/${experimentId}`, { method: 'DELETE' });
}

// =============================================================================
// ADMIN / NOTIFICATION SETTINGS
// =============================================================================

export async function getNotificationSettings() {
  return apiRequest('/api/admin/notifications/settings');
}

export async function updateNotificationSettings(settings) {
  return apiRequest('/api/admin/notifications/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export async function testNotification({ channel, email = null }) {
  return apiRequest('/api/admin/notifications/test', {
    method: 'POST',
    body: JSON.stringify({ channel, email }),
  });
}

export async function getRecentSignups(limit = 50) {
  return apiRequest(`/api/admin/signups/recent?limit=${limit}`);
}

export async function getAdminStats() {
  return apiRequest('/api/admin/stats');
}

// =============================================================================
// DATA EXPORT
// =============================================================================

export async function exportConversations(options) {
  return apiRequest('/api/export/conversations', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export async function getExportStats(days = 30) {
  return apiRequest(`/api/export/stats?days=${days}`);
}

export async function getExportFormats() {
  return apiRequest('/api/export/formats');
}

export async function previewExport(options) {
  return apiRequest('/api/export/preview', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default {
  // Auth
  signup,
  login,
  logout,
  getCurrentUser,
  getToken,
  getUser,
  getOrg,
  isAuthenticated,
  clearAuth,
  
  // Generic API helpers
  apiRequest,
  apiPost,
  apiPatch,
  apiDelete,
  
  // API Keys
  listApiKeys,
  createApiKey,
  revokeApiKey,
  
  // Dashboard
  getDashboardOverview,
  getDashboardTimeseries,
  getDashboardRequests,
  getModelBreakdown,
  getAlerts,
  getCostForecast,
  
  // Analytics - Summary
  getAnalyticsSummary,
  
  // Analytics - Costs
  getCostAnalytics,
  getCostsByModel,
  getCostsByDay,
  getCostsByUser,
  
  // Analytics - Usage
  getUsageAnalytics,
  getUsageByHour,
  getTopUsers,
  
  // Analytics - Performance
  getPerformanceAnalytics,
  getLatencyPercentiles,
  getErrorBreakdown,
  
  // Analytics - Security
  getSecurityAnalytics,
  
  // Analytics - Quality
  getQualityAnalytics,
  
  // Analytics - Compare
  getComparison,
  
  // Analytics - Real-time
  getRealtimeMetrics,
  getRealtimeLogs,
  
  // Analytics - Export
  exportAnalytics,
  runCustomQuery,
  
  // Billing
  getBillingInfo,
  getUsage,
  getPricingPlans,
  createCheckoutSession,
  getBillingPortal,
  getInvoices,
  cancelSubscription,
  
  // Gateway
  getGatewayLogs,
  getRateLimitInfo,
  getCacheStats,
  getProviderStatus,
  
  // AI Insights
  getAIInsights,
  
  // AI Triage
  aiTriage,
  
  // LLM Credentials
  getProviders,
  getCredentialConfig,
  saveCredentials,
  validateCredentials,
  deleteCredentials,
  testCredentialConnection,
  getCredentialAuditLogs,
  
  // Health
  healthCheck,
  
  // Prompt Playground
  runPlayground,
  compareModels,
  getPlaygroundHistory,
  savePlaygroundAsTemplate,
  getPlaygroundModels,
  
  // Prompt Templates
  listTemplates,
  createTemplate,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
  getTemplateVersions,
  rollbackTemplate,
  getTemplateCategories,
  recordTemplateUsage,
  
  // A/B Experiments
  listExperiments,
  createExperiment,
  getExperiment,
  startExperiment,
  pauseExperiment,
  completeExperiment,
  assignVariant,
  recordExperimentResult,
  deleteExperiment,
  
  // Data Export
  exportConversations,
  getExportStats,
  getExportFormats,
  previewExport,
  
  // Admin / Notification Settings
  getNotificationSettings,
  updateNotificationSettings,
  testNotification,
  getRecentSignups,
  getAdminStats,
};
