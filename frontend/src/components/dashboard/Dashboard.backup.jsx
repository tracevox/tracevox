/**
 * Tracevox Dashboard
 * 
 * Production-ready LLM observability dashboard.
 * All data comes from real backend APIs - no demo/mock data.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  DollarSign,
  LineChart,
  RefreshCw,
  Shield,
  Sparkles,
  Users,
  Zap,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  Eye,
  Download,
  Settings,
  Bell,
  Moon,
  Sun,
  Key,
  LogOut,
  ChevronDown,
  User,
  CreditCard,
  FileText,
  MessageSquare,
  Cpu,
  Wand2,
  Copy,
  Check,
  Plus,
  Trash2,
  ExternalLink,
  X,
  Play,
  Bot,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart as ReLineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

import api, { listApiKeys, createApiKey, revokeApiKey } from "@/lib/api";

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function formatCurrency(value) {
  if (value == null) return "$0.00";
  return `$${value.toFixed(4)}`;
}

function formatNumber(value) {
  if (value == null) return "0";
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(0);
}

function formatLatency(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatPercent(value) {
  if (value == null || isNaN(value)) return "0%";
  return `${(value * 100).toFixed(2)}%`;
}

function getChangeColor(value) {
  if (value == null) return "text-muted-foreground";
  if (value > 0) return "text-emerald-500";
  if (value < 0) return "text-rose-500";
  return "text-muted-foreground";
}

function getChangeIcon(value) {
  if (value == null) return null;
  if (value > 0) return <TrendingUp className="h-3 w-3" />;
  if (value < 0) return <TrendingDown className="h-3 w-3" />;
  return null;
}

// =============================================================================
// METRIC CARD COMPONENT
// =============================================================================

function MetricCard({ title, value, change, changeLabel, icon: Icon, color, loading }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {Icon && <Icon className={`h-4 w-4 ${color || "text-muted-foreground"}`} />}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 w-24 bg-muted animate-pulse rounded" />
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {change != null && (
              <p className={`text-xs flex items-center gap-1 ${getChangeColor(change)}`}>
                {getChangeIcon(change)}
                {change > 0 ? "+" : ""}{change?.toFixed(1)}% {changeLabel || "vs last period"}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// OVERVIEW TAB
// =============================================================================

function OverviewTab({ overview, timeseries, comparison, loading }) {
  const chartData = timeseries?.points?.map(p => ({
    timestamp: new Date(p.timestamp).toLocaleDateString(),
    requests: p.requests || 0,
    cost: p.cost_usd || 0,
    latency: p.latency_ms || 0,
    tokens: p.tokens || 0,
  })) || [];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Requests"
          value={formatNumber(overview?.usage?.total_requests)}
          change={comparison?.changes?.requests_pct}
          icon={Activity}
          color="text-blue-500"
          loading={loading}
        />
        <MetricCard
          title="Total Cost"
          value={formatCurrency(overview?.usage?.total_cost_usd)}
          change={comparison?.changes?.cost_pct}
          icon={DollarSign}
          color="text-emerald-500"
          loading={loading}
        />
        <MetricCard
          title="Avg Latency"
          value={formatLatency(overview?.usage?.avg_latency_ms)}
          change={comparison?.changes?.latency_pct}
          icon={Clock}
          color="text-amber-500"
          loading={loading}
        />
        <MetricCard
          title="Error Rate"
          value={formatPercent(overview?.usage?.error_rate)}
          change={comparison?.changes?.error_rate_pct}
          icon={AlertTriangle}
          color="text-rose-500"
          loading={loading}
        />
      </div>

      {/* Usage Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Request Volume</CardTitle>
          <CardDescription>Daily request count over the selected period</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-[300px] bg-muted animate-pulse rounded" />
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="timestamp" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="requests"
                  stroke="#3b82f6"
                  fill="url(#colorRequests)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No data available. Start sending requests through the gateway.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cost Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Cost Trend</CardTitle>
          <CardDescription>Daily cost breakdown</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-[300px] bg-muted animate-pulse rounded" />
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="timestamp" className="text-xs" />
                <YAxis className="text-xs" tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(value) => [`$${value.toFixed(4)}`, "Cost"]} />
                <Bar dataKey="cost" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No cost data available yet.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Limits */}
      {overview?.limits && (
        <Card>
          <CardHeader>
            <CardTitle>Usage Limits</CardTitle>
            <CardDescription>Current billing period usage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Requests Used</span>
                  <span>
                    {formatNumber(overview.limits.requests_used)} / {formatNumber(overview.limits.requests_per_month)}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (overview.limits.requests_used / overview.limits.requests_per_month) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// ANALYTICS TAB
// =============================================================================

function AnalyticsTab({ costs, performance, usage, loading }) {
  const modelData = costs?.by_model?.map(m => ({
    name: m.model?.replace("models/", "") || "unknown",
    cost: m.total_cost || 0,
    requests: m.request_count || 0,
    tokens: m.total_tokens || 0,
  })) || [];

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

  return (
    <div className="space-y-6">
      {/* Model Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Cost by Model</CardTitle>
          <CardDescription>Spend breakdown across different models</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-[300px] bg-muted animate-pulse rounded" />
          ) : modelData.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-6">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={modelData}
                    dataKey="cost"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {modelData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {modelData.map((m, i) => (
                  <div key={m.name} className="flex items-center justify-between p-2 rounded bg-muted/50">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      <span className="font-medium">{m.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatCurrency(m.cost)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatNumber(m.requests)} requests
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No model data available yet.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Latency Percentiles</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-8 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {["p50", "p90", "p95", "p99"].map(p => (
                  <div key={p} className="flex justify-between items-center">
                    <span className="text-sm font-medium uppercase">{p}</span>
                    <span className="font-mono">
                      {formatLatency(performance?.latency?.[p])}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Users</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-8 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : usage?.top_users?.length > 0 ? (
              <div className="space-y-2">
                {usage.top_users.slice(0, 5).map((u, i) => (
                  <div key={i} className="flex justify-between items-center p-2 rounded bg-muted/50">
                    <span className="text-sm truncate max-w-[150px]">{u.user_id || "anonymous"}</span>
                    <Badge variant="secondary">{formatNumber(u.request_count)} req</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">No user data available</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =============================================================================
// SECURITY TAB (DIFFERENTIATOR)
// =============================================================================

function SecurityTab({ security, loading }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Threats Blocked"
          value={formatNumber(security?.summary?.total_blocked)}
          icon={Shield}
          color="text-rose-500"
          loading={loading}
        />
        <MetricCard
          title="SAFE Mode Triggers"
          value={formatNumber(security?.summary?.safe_mode_triggers)}
          icon={CheckCircle}
          color="text-emerald-500"
          loading={loading}
        />
        <MetricCard
          title="Block Rate"
          value={formatPercent(security?.summary?.block_rate / 100)}
          icon={AlertTriangle}
          color="text-amber-500"
          loading={loading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-rose-500" />
            Threat Detection
            <Badge variant="outline" className="ml-2">Differentiator</Badge>
          </CardTitle>
          <CardDescription>
            Automatic detection of prompt injections, jailbreak attempts, and abuse patterns
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-[200px] bg-muted animate-pulse rounded" />
          ) : security?.threats_by_type?.length > 0 ? (
            <div className="space-y-3">
              {security.threats_by_type.map((t, i) => (
                <div key={i} className="flex justify-between items-center p-3 rounded bg-muted/50">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-500" />
                    <span className="font-medium">{t.threat_type || "Unknown"}</span>
                  </div>
                  <Badge variant="destructive">{formatNumber(t.count)} blocked</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No threats detected. Your system is secure.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// QUALITY TAB (DIFFERENTIATOR)
// =============================================================================

function QualityTab({ quality, loading }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Avg Hallucination Risk"
          value={formatPercent(quality?.summary?.avg_hallucination_risk)}
          icon={Eye}
          color="text-amber-500"
          loading={loading}
        />
        <MetricCard
          title="Avg Response Quality"
          value={formatPercent(quality?.summary?.avg_response_quality)}
          icon={Sparkles}
          color="text-emerald-500"
          loading={loading}
        />
        <MetricCard
          title="Flagged Responses"
          value={formatNumber(quality?.summary?.high_risk_count)}
          icon={AlertTriangle}
          color="text-rose-500"
          loading={loading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Quality Monitoring
            <Badge variant="outline" className="ml-2">Differentiator</Badge>
          </CardTitle>
          <CardDescription>
            AI-powered detection of hallucinations and low-quality responses
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-[200px] bg-muted animate-pulse rounded" />
          ) : quality?.flagged_responses?.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Hallucination Risk</TableHead>
                  <TableHead>Quality Score</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quality.flagged_responses.slice(0, 10).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.model}</TableCell>
                    <TableCell>
                      <Badge variant={r.hallucination_risk > 0.7 ? "destructive" : "secondary"}>
                        {formatPercent(r.hallucination_risk)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.response_quality < 0.5 ? "destructive" : "secondary"}>
                        {formatPercent(r.response_quality)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(r.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Sparkles className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No quality issues detected. Responses are high quality.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// REQUESTS TAB
// =============================================================================

function RequestsTab({ requests, loading }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Requests</CardTitle>
        <CardDescription>Latest API requests through the gateway</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : requests?.items?.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Latency</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.items.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(r.timestamp).toLocaleTimeString()}
                  </TableCell>
                  <TableCell className="font-medium">
                    {r.model?.replace("models/", "")}
                  </TableCell>
                  <TableCell>{formatNumber(r.prompt_tokens + r.completion_tokens)}</TableCell>
                  <TableCell>{formatLatency(r.latency_ms)}</TableCell>
                  <TableCell>{formatCurrency(r.cost_usd)}</TableCell>
                  <TableCell>
                    {r.status === "completed" || r.status === "success" ? (
                      <Badge variant="outline" className="text-emerald-500 border-emerald-500">
                        <CheckCircle className="h-3 w-3 mr-1" /> Success
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <XCircle className="h-3 w-3 mr-1" /> {r.status}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No requests yet. Configure your application to use the Tracevox gateway.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// AI INSIGHTS COMPONENT
// =============================================================================

function AIInsightsCard({ insights, loading }) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!insights?.insights?.length && !insights?.recommendations?.length) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          AI Insights
        </CardTitle>
        <CardDescription>Intelligent analysis of your LLM usage</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {insights?.insights?.map((insight, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg border ${
              insight.severity === "high"
                ? "bg-rose-500/10 border-rose-500/20"
                : insight.severity === "medium"
                ? "bg-amber-500/10 border-amber-500/20"
                : insight.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/20"
                : "bg-blue-500/10 border-blue-500/20"
            }`}
          >
            <div className="font-medium">{insight.title}</div>
            <div className="text-sm text-muted-foreground mt-1">{insight.detail}</div>
          </div>
        ))}

        {insights?.recommendations?.length > 0 && (
          <div className="pt-2 border-t">
            <div className="text-sm font-medium mb-2">Recommendations</div>
            {insights.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2 text-sm p-2 rounded bg-muted/50 mb-2">
                <Zap className="h-4 w-4 text-amber-500 mt-0.5" />
                <div>
                  <div>{rec.action}</div>
                  <div className="text-muted-foreground text-xs">{rec.reason}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// SETTINGS MODAL
// =============================================================================

function SettingsModal({ isOpen, onClose, user, org, onOpenApiKeys }) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Manage your account and organization settings
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Profile Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" />
              Profile
            </h3>
            <div className="grid gap-3 pl-6">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Name</span>
                <span className="text-sm font-medium">{user?.name || "—"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Email</span>
                <span className="text-sm font-medium">{user?.email || "—"}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Organization Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Organization
            </h3>
            <div className="grid gap-3 pl-6">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Name</span>
                <span className="text-sm font-medium">{org?.name || "—"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Plan</span>
                <Badge variant="outline" className="capitalize">{org?.tier || "free"}</Badge>
              </div>
            </div>
          </div>

          <Separator />

          {/* Quick Actions */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Quick Actions</h3>
            <div className="grid gap-2">
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => {
                  onClose();
                  onOpenApiKeys();
                }}
              >
                <Key className="h-4 w-4 mr-2" />
                Manage API Keys
              </Button>
              <Button variant="outline" className="justify-start" disabled>
                <CreditCard className="h-4 w-4 mr-2" />
                Billing & Subscription
                <Badge variant="secondary" className="ml-auto text-xs">Coming Soon</Badge>
              </Button>
              <Button variant="outline" className="justify-start" disabled>
                <Users className="h-4 w-4 mr-2" />
                Team Members
                <Badge variant="secondary" className="ml-auto text-xs">Coming Soon</Badge>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// API KEYS MODAL
// =============================================================================

function ApiKeysModal({ isOpen, onClose }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchKeys();
    }
  }, [isOpen]);

  const fetchKeys = async () => {
    try {
      const data = await listApiKeys();
      setKeys(data || []);
    } catch (error) {
      console.error("Failed to fetch keys:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const key = await createApiKey({ name: newKeyName, environment: "production" });
      setNewKey(key);
      setNewKeyName("");
      fetchKeys();
    } catch (error) {
      console.error("Failed to create key:", error);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId) => {
    if (!confirm("Are you sure you want to revoke this key?")) return;
    try {
      await revokeApiKey(keyId);
      fetchKeys();
    } catch (error) {
      console.error("Failed to revoke key:", error);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Keys
          </DialogTitle>
          <DialogDescription>
            Manage your API keys for accessing the Tracevox gateway. Use these to integrate with your LLM applications.
          </DialogDescription>
        </DialogHeader>

        {newKey && (
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-emerald-500">New Key Created!</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(newKey.key)}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <code className="text-sm font-mono break-all">{newKey.key}</code>
            <p className="text-xs text-amber-500 mt-2">
              ⚠️ Copy this key now - you will not see it again!
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setNewKey(null)}
            >
              <X className="h-4 w-4 mr-1" /> Dismiss
            </Button>
          </div>
        )}

        {/* Integration Guide */}
        <div className="p-4 rounded-lg bg-muted/50 border">
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Quick Integration
          </h4>
          <pre className="text-xs font-mono bg-background p-3 rounded overflow-x-auto">
{`# Python (OpenAI SDK)
from openai import OpenAI

client = OpenAI(
    base_url="https://api.tracevox.ai/v1",
    api_key="YOUR_OPENAI_KEY",
    default_headers={
        "X-Tracevox-Key": "YOUR_TRACEVOX_KEY"
    }
)`}
          </pre>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Key name (e.g., Production, Development)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <Button onClick={handleCreate} disabled={creating || !newKeyName.trim()}>
            {creating ? (
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" /> Create
              </>
            )}
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : keys.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key Prefix</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.name}</TableCell>
                  <TableCell className="font-mono text-sm">{key.prefix}...</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(key.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={key.is_active ? "outline" : "secondary"}>
                      {key.is_active ? "Active" : "Revoked"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {key.is_active && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevoke(key.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Key className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No API keys yet. Create one to get started.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// AI TRIAGE PANEL
// =============================================================================

function AITriagePanel({ insights, onGenerateReport, onExplainWithAI }) {
  const [triageLoading, setTriageLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  const incidents = [
    {
      id: 1,
      title: "High Latency Alert",
      severity: "high",
      metric: "p95_latency_ms",
      description: "P95 latency exceeded threshold for 3+ minutes",
      recommendation: "Check model provider status and network connectivity",
    },
    {
      id: 2,
      title: "Error Rate Spike",
      severity: "medium",
      metric: "error_rate",
      description: "Error rate increased by 15% in the last hour",
      recommendation: "Review recent deployments and API changes",
    },
  ];

  const hasActiveIncidents = incidents.length > 0;

  return (
    <Card className="border-purple-500/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5 text-purple-500" />
            AI Triage
            <Badge variant="outline" className="text-xs">Beta</Badge>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={onExplainWithAI}
            className="text-xs"
          >
            <Wand2 className="h-3 w-3 mr-1" />
            Explain with AI
          </Button>
        </div>
        <CardDescription className="text-xs">
          AI-powered incident detection and analysis
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            onClick={onGenerateReport}
            disabled={reportLoading}
          >
            {reportLoading ? (
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            Generate Incident Report
          </Button>
        </div>

        <Separator />

        {/* Triage Queue */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium">Triage Queue</h4>
            <Badge variant={hasActiveIncidents ? "destructive" : "secondary"}>
              {hasActiveIncidents ? `${incidents.length} open` : "All clear"}
            </Badge>
          </div>

          {hasActiveIncidents ? (
            <div className="space-y-2">
              {incidents.map((incident) => (
                <div
                  key={incident.id}
                  className={`p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${
                    incident.severity === "high"
                      ? "border-rose-500/30 bg-rose-500/5"
                      : incident.severity === "medium"
                      ? "border-amber-500/30 bg-amber-500/5"
                      : "border-muted"
                  }`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className="font-medium text-sm">{incident.title}</span>
                    <Badge
                      variant={incident.severity === "high" ? "destructive" : "secondary"}
                      className="text-xs"
                    >
                      {incident.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {incident.description}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-purple-500">
                    <Zap className="h-3 w-3" />
                    {incident.recommendation}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
              <p className="text-sm">No active incidents</p>
              <p className="text-xs">Your system is healthy</p>
            </div>
          )}
        </div>

        {/* Live Triage Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setTriageLoading(true)}
          disabled={triageLoading}
        >
          {triageLoading ? (
            <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Run Live Triage
        </Button>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// AI EXPLAIN MODAL
// =============================================================================

function AIExplainModal({ isOpen, onClose, data }) {
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState(null);

  useEffect(() => {
    if (isOpen) {
      generateExplanation();
    }
  }, [isOpen]);

  const generateExplanation = async () => {
    setLoading(true);
    // Simulate AI explanation generation
    setTimeout(() => {
      setExplanation({
        summary: "Your LLM observability system is performing within normal parameters. Here's what I found:",
        insights: [
          {
            title: "Request Volume",
            detail: "Request volume is consistent with typical usage patterns. No unusual spikes detected.",
            status: "healthy",
          },
          {
            title: "Cost Efficiency",
            detail: "Your cost per request is optimized. Consider caching frequent queries to further reduce costs.",
            status: "info",
          },
          {
            title: "Latency Performance",
            detail: "P95 latency is within acceptable bounds. Some requests are taking longer than optimal - consider model selection optimization.",
            status: "warning",
          },
        ],
        recommendations: [
          "Enable request caching for frequently asked questions",
          "Consider using smaller models for simple tasks",
          "Set up cost alerts at 80% of your budget",
        ],
      });
      setLoading(false);
    }, 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-purple-500" />
            AI Explanation
          </DialogTitle>
          <DialogDescription>
            AI-powered analysis of your LLM observability data
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-8">
            <div className="flex items-center justify-center">
              <div className="h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-center text-muted-foreground">
              Analyzing your data with AI...
            </p>
          </div>
        ) : explanation ? (
          <div className="space-y-4">
            <p className="text-sm">{explanation.summary}</p>

            <div className="space-y-3">
              {explanation.insights.map((insight, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg border ${
                    insight.status === "healthy"
                      ? "bg-emerald-500/10 border-emerald-500/20"
                      : insight.status === "warning"
                      ? "bg-amber-500/10 border-amber-500/20"
                      : "bg-blue-500/10 border-blue-500/20"
                  }`}
                >
                  <div className="font-medium text-sm">{insight.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {insight.detail}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t">
              <div className="text-sm font-medium mb-2">Recommendations</div>
              <ul className="space-y-2">
                {explanation.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Zap className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// MAIN DASHBOARD COMPONENT
// =============================================================================

export default function Dashboard({ onLogout }) {
  // Data state
  const [overview, setOverview] = useState(null);
  const [timeseries, setTimeseries] = useState(null);
  const [requests, setRequests] = useState(null);
  const [costs, setCosts] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [usage, setUsage] = useState(null);
  const [security, setSecurity] = useState(null);
  const [quality, setQuality] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [insights, setInsights] = useState(null);
  const [health, setHealth] = useState(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [timeRange, setTimeRange] = useState("7");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [theme, setTheme] = useState(() => {
    // Check localStorage first, then system preference
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("tracevox_theme");
      if (saved) return saved;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "dark";
  });

  // Modal state
  const [showSettings, setShowSettings] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [showAIExplain, setShowAIExplain] = useState(false);

  const timerRef = useRef(null);

  // Theme effect - apply theme class to document
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("tracevox_theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === "dark" ? "light" : "dark");
  };

  // Fetch all dashboard data
  const fetchData = useCallback(async () => {
    try {
      // Check health first
      const healthData = await api.healthCheck().catch(() => null);
      setHealth(healthData);

      // Fetch all data in parallel
      const [
        overviewData,
        timeseriesData,
        requestsData,
        costsData,
        performanceData,
        usageData,
        securityData,
        qualityData,
        comparisonData,
        insightsData,
      ] = await Promise.all([
        api.getDashboardOverview({ days: parseInt(timeRange) }).catch(() => null),
        api.getDashboardTimeseries({ days: parseInt(timeRange), granularity: "day" }).catch(() => null),
        api.getDashboardRequests({ limit: 50 }).catch(() => null),
        api.getCostAnalytics({ days: parseInt(timeRange) }).catch(() => null),
        api.getPerformanceAnalytics({ days: parseInt(timeRange) }).catch(() => null),
        api.getUsageAnalytics({ days: parseInt(timeRange) }).catch(() => null),
        api.getSecurityAnalytics({ days: parseInt(timeRange) }).catch(() => null),
        api.getQualityAnalytics({ days: parseInt(timeRange) }).catch(() => null),
        api.getComparison({ period: "week" }).catch(() => null),
        api.getAIInsights().catch(() => null),
      ]);

      setOverview(overviewData);
      setTimeseries(timeseriesData);
      setRequests(requestsData);
      setCosts(costsData);
      setPerformance(performanceData);
      setUsage(usageData);
      setSecurity(securityData);
      setQuality(qualityData);
      setComparison(comparisonData);
      setInsights(insightsData);
      setLastRefresh(new Date());
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(fetchData, 30000); // 30 seconds
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, fetchData]);

  const user = api.getUser();
  const org = api.getOrg();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
              Tracevox
            </h1>
            {org && (
              <Badge variant="outline">{org.name}</Badge>
            )}
            {health?.status && (
              <Badge
                variant={health.status === "healthy" ? "outline" : "destructive"}
                className={health.status === "healthy" ? "text-emerald-500 border-emerald-500" : ""}
              >
                {health.status === "healthy" ? "Connected" : "Disconnected"}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Time Range Selector */}
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 24h</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>

            {/* Theme Toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              className="relative h-9 w-9 rounded-lg border-muted-foreground/20 bg-background hover:bg-muted transition-all duration-300"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              <Sun className={`h-4 w-4 transition-all duration-300 ${theme === "dark" ? "rotate-0 scale-100" : "rotate-90 scale-0"} absolute`} />
              <Moon className={`h-4 w-4 transition-all duration-300 ${theme === "dark" ? "-rotate-90 scale-0" : "rotate-0 scale-100"} absolute`} />
              <span className="sr-only">Toggle theme</span>
            </Button>

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              className="hidden sm:flex"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            {/* Mobile Refresh */}
            <Button
              variant="outline"
              size="icon"
              onClick={fetchData}
              disabled={loading}
              className="sm:hidden h-9 w-9"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>

            {/* User Menu Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-medium">
                    {(user?.name || user?.email || "U")[0].toUpperCase()}
                  </div>
                  <span className="hidden sm:inline max-w-[120px] truncate">
                    {user?.name || user?.email || "Account"}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user?.name || "User"}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowSettings(true)}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowApiKeys(true)}>
                  <Key className="h-4 w-4 mr-2" />
                  API Keys
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Billing
                  <Badge variant="secondary" className="ml-auto text-xs">Soon</Badge>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-rose-500 focus:text-rose-500">
                  <LogOut className="h-4 w-4 mr-2" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="security">
              <Shield className="h-4 w-4 mr-1" />
              Security
            </TabsTrigger>
            <TabsTrigger value="quality">
              <Sparkles className="h-4 w-4 mr-1" />
              Quality
            </TabsTrigger>
            <TabsTrigger value="requests">Requests</TabsTrigger>
          </TabsList>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <TabsContent value="overview" className="mt-0">
                <OverviewTab
                  overview={overview}
                  timeseries={timeseries}
                  comparison={comparison}
                  loading={loading}
                />
              </TabsContent>

              <TabsContent value="analytics" className="mt-0">
                <AnalyticsTab
                  costs={costs}
                  performance={performance}
                  usage={usage}
                  loading={loading}
                />
              </TabsContent>

              <TabsContent value="security" className="mt-0">
                <SecurityTab security={security} loading={loading} />
              </TabsContent>

              <TabsContent value="quality" className="mt-0">
                <QualityTab quality={quality} loading={loading} />
              </TabsContent>

              <TabsContent value="requests" className="mt-0">
                <RequestsTab requests={requests} loading={loading} />
              </TabsContent>
            </div>

            {/* Sidebar - AI Triage & Insights */}
            <div className="space-y-6">
              {/* AI Triage Panel */}
              <AITriagePanel
                insights={insights}
                onGenerateReport={() => console.log("Generate report")}
                onExplainWithAI={() => setShowAIExplain(true)}
              />

              {/* AI Insights */}
              <AIInsightsCard insights={insights} loading={loading} />

              {/* Quick Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Quick Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Tokens</span>
                    <span className="font-medium">{formatNumber(overview?.usage?.total_tokens)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Organization</span>
                    <span className="font-medium capitalize">{org?.tier || "free"}</span>
                  </div>
                  {lastRefresh && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Updated</span>
                      <span className="font-medium">{lastRefresh.toLocaleTimeString()}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Integration Quick Start */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Cpu className="h-4 w-4" />
                    Integration
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowApiKeys(true)}
                  >
                    <Key className="h-4 w-4 mr-2" />
                    Get API Key
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Connect your LLM apps in minutes
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </Tabs>
      </main>

      {/* Modals */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        user={user}
        org={org}
        onOpenApiKeys={() => {
          setShowSettings(false);
          setShowApiKeys(true);
        }}
      />

      <ApiKeysModal
        isOpen={showApiKeys}
        onClose={() => setShowApiKeys(false)}
      />

      <AIExplainModal
        isOpen={showAIExplain}
        onClose={() => setShowAIExplain(false)}
        data={{ overview, insights }}
      />
    </div>
  );
}
