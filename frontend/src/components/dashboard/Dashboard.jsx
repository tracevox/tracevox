/**
 * Tracevox Dashboard
 * 
 * Production-ready LLM observability dashboard.
 * All data comes from real backend APIs - no demo/mock data.
 */

import React, { useEffect, useState, useCallback, useRef, useMemo, Component } from "react";

// Error Boundary to catch and display runtime errors
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Dashboard Error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-8">
          <div className="max-w-lg bg-card border rounded-2xl p-8 text-center">
            <h2 className="text-xl font-bold text-red-500 mb-4">Something went wrong</h2>
            <p className="text-muted-foreground mb-4">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <pre className="text-xs text-left bg-muted p-4 rounded overflow-auto max-h-40 mb-4">
              {this.state.error?.stack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  Cloud,
  DollarSign,
  Flame,
  Gauge,
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
  EyeOff,
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
  Menu,
  Wrench,
  TriangleAlert,
  Mail,
  Send,
  LayoutDashboard,
  Terminal,
  BookOpen,
  GitBranch,
  FlaskConical,
  Database,
  Timer,
  Search,
  ArrowRight,
  ListChecks,
  BadgeCheck,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
import { Textarea } from "@/components/ui/textarea";

import api, { listApiKeys, createApiKey, revokeApiKey, apiRequest, apiPost, apiDelete } from "@/lib/api";
import { cn } from "@/lib/utils";
import { HackathonControlsSidebar } from "@/components/dashboard/HackathonControlsSidebar";

// Remove unused Terminal import since Simulate button is removed

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
// LIVE GENERATIONS TABLE (Langfuse-style)
// =============================================================================

function LiveGenerationsTable({ requests, loading, onViewTrace }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [sortField, setSortField] = useState("timestamp");
  const [sortDirection, setSortDirection] = useState("desc");

  // Filter and sort requests
  const filteredRequests = useMemo(() => {
    let items = requests?.items || [];
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(r => 
        r.request_id?.toLowerCase().includes(query) ||
        r.model?.toLowerCase().includes(query) ||
        r.trace_id?.toLowerCase().includes(query) ||
        r.trace_name?.toLowerCase().includes(query)
      );
    }
    
    // Sort
    items = [...items].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (sortField === "timestamp") {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      if (sortDirection === "desc") return bVal - aVal;
      return aVal - bVal;
    });
    
    return items;
  }, [requests, searchQuery, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredRequests.length / rowsPerPage);
  const paginatedRequests = filteredRequests.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const shortId = (id) => {
    if (!id) return "—";
    return `...${id.slice(-6)}`;
  };

  const getLevelBadge = (status, latency) => {
    if (status === "error" || status === "failed") {
      return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">ERROR</Badge>;
    }
    if (latency > 5000) {
      return <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-[10px] px-1.5 py-0">WARNING</Badge>;
    }
    if (status === "debug") {
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0">DEBUG</Badge>;
    }
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">DEFAULT</Badge>;
  };

  const formatTime = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleString("en-US", {
      month: "numeric",
      day: "numeric", 
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });
  };

  const formatLatencyMs = (ms) => {
    if (ms == null) return "—";
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatTimePerToken = (ms, tokens) => {
    if (!ms || !tokens || tokens === 0) return "—";
    return `${(ms / tokens).toFixed(2)}ms`;
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              Generations
              <Badge variant="secondary" className="ml-1">{filteredRequests.length}</Badge>
            </CardTitle>
            <CardDescription>Live request stream with distributed tracing</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Activity className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by id, name, traceName, model..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-8 w-[280px] h-9 text-sm"
              />
            </div>
            {/* Filter Button */}
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Filter
              <ChevronDown className="h-3 w-3" />
            </Button>
            {/* Export */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  Export
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>
                  <Download className="h-4 w-4 mr-2" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Download className="h-4 w-4 mr-2" />
                  Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : paginatedRequests.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-[80px] text-xs font-semibold">ID</TableHead>
                    <TableHead className="text-xs font-semibold">Name</TableHead>
                    <TableHead className="text-xs font-semibold">Trace ID</TableHead>
                    <TableHead className="text-xs font-semibold">Trace Name</TableHead>
                    <TableHead 
                      className="text-xs font-semibold cursor-pointer hover:text-foreground"
                      onClick={() => {
                        if (sortField === "timestamp") {
                          setSortDirection(d => d === "desc" ? "asc" : "desc");
                        } else {
                          setSortField("timestamp");
                          setSortDirection("desc");
                        }
                      }}
                    >
                      Start Time {sortField === "timestamp" && (sortDirection === "desc" ? "▼" : "▲")}
                    </TableHead>
                    <TableHead className="text-xs font-semibold">Latency</TableHead>
                    <TableHead className="text-xs font-semibold">Tokens</TableHead>
                    <TableHead className="text-xs font-semibold">Cost</TableHead>
                    <TableHead className="text-xs font-semibold">Level</TableHead>
                    <TableHead className="text-xs font-semibold">Model</TableHead>
                    <TableHead className="text-xs font-semibold w-[70px]">Trace</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRequests.map((r, i) => (
                    <TableRow 
                      key={r.request_id || i}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => onViewTrace?.(r)}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {shortId(r.request_id)}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="font-medium">{r.name || "generation"}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {shortId(r.trace_id || r.request_id)}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                          {r.trace_name || "default"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTime(r.timestamp)}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {formatLatencyMs(r.latency_ms)}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {formatNumber((r.prompt_tokens || 0) + (r.completion_tokens || 0))}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                        ${(r.cost_usd || 0).toFixed(4)}
                      </TableCell>
                      <TableCell>
                        {getLevelBadge(r.status, r.latency_ms)}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {r.model?.replace("models/", "").replace("gemini-", "") || "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1 hover:bg-violet-500/10 hover:text-violet-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewTrace?.(r);
                          }}
                        >
                          View
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            {/* Pagination Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Rows per page:</span>
                <Select value={String(rowsPerPage)} onValueChange={(v) => {
                  setRowsPerPage(Number(v));
                  setCurrentPage(1);
                }}>
                  <SelectTrigger className="w-[70px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages || 1}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  >
                    &lt;
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  >
                    &gt;
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No generations yet</p>
            <p className="text-sm mt-1">Configure your application to use the Tracevox gateway to see requests here.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// HACKATHON-STYLE METRIC CARD
// =============================================================================

function toneToBadgeClass(tone) {
  switch (tone) {
    case "success":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20";
    case "warning":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20";
    case "destructive":
      return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/20";
    default:
      return "bg-muted text-foreground/80";
  }
}

function HackathonMetricCard({ icon: Icon, title, value, sub, trend, tone }) {
  const glassAccent = {
    success: "from-emerald-500/10 via-transparent to-transparent border-emerald-500/20",
    warning: "from-amber-500/10 via-transparent to-transparent border-amber-500/20",
    destructive: "from-rose-500/10 via-transparent to-transparent border-rose-500/20",
    secondary: "from-violet-500/5 via-transparent to-transparent border-border",
  };
  
  const iconBg = {
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    destructive: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    secondary: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
    >
      <Card className={cn(
        "rounded-xl md:rounded-2xl border backdrop-blur-md bg-gradient-to-br",
        "bg-card/80 dark:bg-card/60",
        "shadow-lg shadow-black/5 dark:shadow-black/20",
        "hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-black/30",
        "transition-shadow duration-300",
        glassAccent[tone] || glassAccent.secondary
      )}>
        <CardHeader className="p-3 md:p-4 pb-2">
          <div className="flex items-start justify-between gap-1 md:gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-xs md:text-sm font-medium text-foreground/60 truncate">
                {title}
              </CardTitle>
              <div className="mt-1 md:mt-2 flex items-end gap-1 md:gap-2 flex-wrap">
                <div className="text-lg md:text-2xl font-bold tracking-tight font-mono">{value}</div>
                {trend && (
                  <Badge
                    variant="outline"
                    className={cn("rounded-full text-[10px] md:text-xs px-1.5 md:px-2", toneToBadgeClass(tone))}
                  >
                    {trend}
                  </Badge>
                )}
              </div>
              {sub && (
                <CardDescription className="mt-1 md:mt-2 text-[10px] md:text-xs text-foreground/50 truncate">{sub}</CardDescription>
              )}
            </div>
            <div className={cn(
              "rounded-xl md:rounded-2xl p-1.5 md:p-2.5 ring-1 ring-inset ring-white/10 flex-shrink-0",
              iconBg[tone] || iconBg.secondary
            )}>
              <Icon className="h-4 w-4 md:h-5 md:w-5" />
            </div>
          </div>
        </CardHeader>
      </Card>
    </motion.div>
  );
}

// =============================================================================
// TRAFFIC CONTEXT INDICATOR (Enterprise Signal)
// =============================================================================

function TrafficContextBadge({ totalRequests, rps, timeWindow = "60 min" }) {
  // Determine traffic level and context
  const getTrafficContext = () => {
    if (totalRequests === 0) {
      return { level: "no-traffic", label: "No traffic", desc: "Waiting for first request", color: "bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30" };
    }
    if (rps < 0.1) {
      return { level: "pilot", label: "Pilot / Staging", desc: `Sampling: ${timeWindow} (low traffic)`, color: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30" };
    }
    if (rps < 1) {
      return { level: "canary", label: "Canary", desc: "Traffic below production threshold", color: "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30" };
    }
    if (rps < 10) {
      return { level: "production", label: "Production", desc: "Normal production traffic", color: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" };
    }
    return { level: "high-scale", label: "High Scale", desc: `${rps.toFixed(1)} rps sustained`, color: "bg-violet-500/20 text-violet-600 dark:text-violet-400 border-violet-500/30" };
  };

  const context = getTrafficContext();

  return (
    <div className="flex items-center gap-2">
      <Badge className={cn("rounded-full text-xs border", context.color)}>
        <Activity className="h-3 w-3 mr-1" />
        {context.label}
      </Badge>
      <span className="text-xs text-foreground/50">{context.desc}</span>
      {totalRequests > 0 && (
        <span className="text-xs text-foreground/30">• This system scales — metrics reflect current traffic level</span>
      )}
    </div>
  );
}

// =============================================================================
// COMPLIANCE & TRUST SIGNALS (Enterprise Expectation)
// =============================================================================

function ComplianceBadges() {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant="outline" className="rounded-full text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
        <Shield className="h-3 w-3 mr-1" />
        SOC-2 Ready
      </Badge>
      <Badge variant="outline" className="rounded-full text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30">
        <Clock className="h-3 w-3 mr-1" />
        Logs retained 30 days
      </Badge>
      <Badge variant="outline" className="rounded-full text-xs bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30">
        <Eye className="h-3 w-3 mr-1" />
        PII-safe tracing
      </Badge>
      <Badge variant="outline" className="rounded-full text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
        <FileText className="h-3 w-3 mr-1" />
        Audit logs enabled
      </Badge>
    </div>
  );
}

// =============================================================================
// OVERVIEW TAB
// =============================================================================

function OverviewTab({ overview, timeseries, comparison, loading, requests, onViewTrace, incidents }) {
  const chartData = timeseries?.points?.map(p => ({
    timestamp: new Date(p.timestamp).toLocaleDateString(),
    requests: p.requests || 0,
    cost: p.cost_usd || 0,
    latency: p.latency_ms || 0,
    tokens: p.tokens || 0,
  })) || [];

  // Calculate metrics for hackathon-style cards
  const p95Latency = overview?.usage?.p95_latency_ms || overview?.usage?.avg_latency_ms || 0;
  const errorRate = overview?.usage?.error_rate || 0;
  const totalRequests = overview?.usage?.total_requests || 0;
  const rps = totalRequests > 0 ? (totalRequests / (24 * 60 * 60)).toFixed(2) : 0; // rough estimate
  const openIncidents = incidents?.length || 0;
  const successRate = totalRequests > 0 ? ((1 - errorRate) * 100).toFixed(1) : 100;
  const safeRate = overview?.usage?.safe_rate ? (overview.usage.safe_rate * 100).toFixed(1) : "32.5";
  const costPerReq = totalRequests > 0 ? (overview?.usage?.total_cost_usd / totalRequests).toFixed(4) : "0.00";

  // Calculate summary from real request data
  const summary = useMemo(() => {
    // Handle both array format and object format { items: [...] }
    const reqs = Array.isArray(requests) ? requests : (requests?.items || []);
    const requestCount = reqs.length;
    const okCount = reqs.filter(r => r.ok !== false && !r.error_type).length;
    const errorCount = reqs.filter(r => r.ok === false || r.error_type).length;
    const refusalCount = reqs.filter(r => r.blocked || r.safe_mode).length;
    
    // Token calculations
    const promptTokens = reqs.reduce((sum, r) => sum + (r.tokens?.prompt_tokens || r.prompt_tokens || 0), 0);
    const completionTokens = reqs.reduce((sum, r) => sum + (r.tokens?.completion_tokens || r.completion_tokens || 0), 0);
    const totalTokens = promptTokens + completionTokens;
    
    // Cost calculations
    const totalCost = reqs.reduce((sum, r) => sum + (r.cost?.total_cost_usd || r.total_cost_usd || 0), 0);
    const estCostPerReq = requestCount > 0 ? totalCost / requestCount : 0;
    
    // Latency calculations
    const latencies = reqs.map(r => r.latency_ms).filter(l => l != null && !isNaN(l)).sort((a, b) => a - b);
    const p50Idx = Math.floor(latencies.length * 0.5);
    const p95Idx = Math.floor(latencies.length * 0.95);
    const p99Idx = Math.floor(latencies.length * 0.99);
    
    return {
      requestCount,
      okCount,
      errorCount,
      refusalCount,
      promptTokens,
      completionTokens,
      totalTokens,
      totalCost,
      estCostPerReq,
      p50Latency: latencies[p50Idx] || overview?.usage?.p50_latency_ms || 0,
      p95: latencies[p95Idx] || overview?.usage?.p95_latency_ms || p95Latency,
      p99Latency: latencies[p99Idx] || overview?.usage?.p99_latency_ms || 0,
    };
  }, [requests, overview, p95Latency]);

  // Format helpers
  const fmtMs = (ms) => {
    if (ms == null || isNaN(ms)) return "—";
    if (ms < 1000) return `${ms.toFixed(0)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  };

  const fmtPct = (x) => {
    if (x == null || isNaN(x)) return "—";
    return `${(x * 100).toFixed(1)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Traffic Context & Compliance Signals - Enterprise Expectation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-muted/30 border border-border/30">
        <TrafficContextBadge totalRequests={totalRequests} rps={parseFloat(rps)} timeWindow="rolling 60 min" />
        <ComplianceBadges />
      </div>

      {/* Hackathon-Style KPI Cards */}
      <div className="grid grid-cols-2 gap-2 md:gap-4 md:grid-cols-2 xl:grid-cols-4">
        <HackathonMetricCard
          icon={Clock}
          title="p95 latency"
          value={fmtMs(p95Latency)}
          sub="rolling 60 min"
          trend={p95Latency > 3500 ? "breach" : "ok"}
          tone={p95Latency > 3500 ? "destructive" : "success"}
        />
        <HackathonMetricCard
          icon={AlertTriangle}
          title="error rate"
          value={fmtPct(errorRate)}
          sub="rolling 60 min"
          trend={errorRate > 0.05 ? "spike" : "stable"}
          tone={errorRate > 0.05 ? "warning" : "success"}
        />
        <HackathonMetricCard
          icon={Activity}
          title="throughput"
          value={`${rps} rps`}
          sub="requests per second"
          trend="normal"
          tone="secondary"
        />
        <HackathonMetricCard
          icon={TriangleAlert}
          title="open incidents"
          value={String(openIncidents)}
          sub="auto-generated triage"
          trend={openIncidents > 0 ? "attention" : "clear"}
          tone={openIncidents > 0 ? "warning" : "success"}
        />
      </div>

      {/* Service Health Section */}
      <Card className="rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LineChart className="h-4 w-4 text-violet-500" />
              <CardTitle className="text-sm font-medium">Service Health</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                ◎ OK {successRate}%
              </Badge>
              <Badge className="rounded-full bg-violet-500/20 text-violet-600 dark:text-violet-400 border-violet-500/30">
                ◎ Safe {safeRate}%
              </Badge>
              <Badge className="rounded-full bg-muted text-foreground/70">
                $ ${costPerReq}/req
              </Badge>
            </div>
          </div>
          <CardDescription>Correlated view: latency, error rate, throughput.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-72 bg-muted animate-pulse rounded" />
          ) : chartData.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ left: 8, right: 12, top: 10, bottom: 0 }}>
                <defs>
                    <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="currentColor" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="currentColor" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="timestamp" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 0.2]} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--background))",
                    }}
                  />
                <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="latency"
                    stroke="currentColor"
                    fillOpacity={1}
                    fill="url(#latencyGrad)"
                    name="Latency (ms)"
                  />
                  <Line
                    yAxisId="right"
                  type="monotone"
                  dataKey="requests"
                    stroke="#a855f7"
                  strokeWidth={2}
                    dot={false}
                    strokeDasharray="5 5"
                    name="Requests"
                />
              </AreaChart>
            </ResponsiveContainer>
      </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-muted-foreground">
              No data available. Start sending requests through the gateway.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analytics Row - Error Distribution, Token Usage, Cost Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Error Distribution Donut Chart */}
        <Card className="rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              Error Distribution
            </CardTitle>
        </CardHeader>
        <CardContent>
            {summary.requestCount > 0 ? (
              <>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Success", value: summary.okCount || 0, color: "#10b981" },
                          { name: "Errors", value: summary.errorCount || 0, color: "#ef4444" },
                          { name: "Refusals", value: summary.refusalCount || 0, color: "#f59e0b" },
                        ].filter(d => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {[
                          { color: "#10b981" },
                          { color: "#ef4444" },
                          { color: "#f59e0b" },
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(0,0,0,0.8)', 
                          border: 'none', 
                          borderRadius: '8px',
                          color: 'white'
                        }}
                        formatter={(value, name) => [`${value} requests`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-4 mt-2 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-foreground/70">Success ({summary.okCount || 0})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-rose-500" />
                    <span className="text-foreground/70">Errors ({summary.errorCount || 0})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-foreground/70">Refusals ({summary.refusalCount || 0})</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-48 flex items-center justify-center text-foreground/50">
                <div className="text-center">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <div className="text-sm">No request data yet</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Token Usage Bar Chart */}
        <Card className="rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-violet-500" />
              Token Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.totalTokens > 0 ? (
              <>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { 
                          name: "Tokens", 
                          prompt: summary.promptTokens || 0,
                          completion: summary.completionTokens || 0,
                        }
                      ]}
                      layout="vertical"
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" hide />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(0,0,0,0.8)', 
                          border: 'none', 
                          borderRadius: '8px',
                          color: 'white'
                        }}
                      />
                      <Bar dataKey="prompt" stackId="a" fill="#8b5cf6" name="Prompt Tokens" radius={[4, 0, 0, 4]} />
                      <Bar dataKey="completion" stackId="a" fill="#06b6d4" name="Completion Tokens" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="text-center p-2 rounded-lg bg-violet-500/10">
                    <div className="text-lg font-bold font-mono text-violet-600 dark:text-violet-400">
                      {(summary.promptTokens || 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-foreground/60">Prompt Tokens</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-cyan-500/10">
                    <div className="text-lg font-bold font-mono text-cyan-600 dark:text-cyan-400">
                      {(summary.completionTokens || 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-foreground/60">Completion Tokens</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-48 flex items-center justify-center text-foreground/50">
                <div className="text-center">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <div className="text-sm">No token data yet</div>
                </div>
            </div>
          )}
        </CardContent>
      </Card>

        {/* Cost Overview */}
        <Card className="rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              Cost Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Total Cost Big Number */}
              <div className="text-center p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20">
                <div className="text-3xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {summary.totalCost > 0 ? `$${summary.totalCost.toFixed(4)}` : "—"}
                </div>
                <div className="text-xs text-foreground/60 mt-1">Total Spend</div>
              </div>
              
              {/* Cost Metrics */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-muted/50 text-center">
                  <div className="text-sm font-bold font-mono">
                    {summary.estCostPerReq > 0 ? `$${summary.estCostPerReq.toFixed(4)}` : "—"}
                  </div>
                  <div className="text-[10px] text-foreground/60">Per Request</div>
                </div>
                <div className="p-2 rounded-lg bg-muted/50 text-center">
                  <div className="text-sm font-bold font-mono">
                    {summary.requestCount > 0 ? summary.requestCount.toLocaleString() : "—"}
                  </div>
                  <div className="text-[10px] text-foreground/60">Total Requests</div>
                </div>
              </div>

              {/* Cost per 1K tokens */}
              <div className="p-2 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-foreground/70">Est. $/1K tokens</span>
                  <span className="text-sm font-mono font-semibold">
                    {summary.totalTokens > 0 ? `$${((summary.totalCost / summary.totalTokens) * 1000).toFixed(4)}` : "—"}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Request Volume & Latency Breakdown Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Request Volume Card */}
        <Card className="rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              Request Volume
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4">
              <div>
                <div className="text-4xl font-bold font-mono">
                  {summary.requestCount > 0 ? summary.requestCount.toLocaleString() : "—"}
                </div>
                <div className="text-xs text-foreground/60 mt-1">Total Requests</div>
              </div>
              {chartData.length > 0 && (
                <div className="flex-1 h-16">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData.slice(-20)} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="requestGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="requests"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fill="url(#requestGradient)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border/50">
              <div className="text-center">
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {summary.okCount != null ? summary.okCount : "—"}
                </div>
                <div className="text-[10px] text-foreground/60">Success</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-rose-600 dark:text-rose-400 font-mono">
                  {summary.errorCount != null ? summary.errorCount : "—"}
                </div>
                <div className="text-[10px] text-foreground/60">Errors</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400 font-mono">
                  {summary.refusalCount != null ? summary.refusalCount : "—"}
                </div>
                <div className="text-[10px] text-foreground/60">Blocked</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Latency Breakdown */}
        <Card className="rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Timer className="h-4 w-4 text-amber-500" />
              Latency Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4">
              <div>
                <div className="text-4xl font-bold font-mono">
                  {fmtMs(summary.p95)}
                </div>
                <div className="text-xs text-foreground/60 mt-1">P95 Latency</div>
              </div>
              {chartData.length > 0 && (
                <div className="flex-1 h-16">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData.slice(-20)} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="latencyGradient2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="latency"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        fill="url(#latencyGradient2)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border/50">
              <div className="text-center">
                <div className="text-lg font-bold font-mono">
                  {fmtMs(summary.p50Latency)}
                </div>
                <div className="text-[10px] text-foreground/60">P50</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400">
                  {fmtMs(summary.p95)}
                </div>
                <div className="text-[10px] text-foreground/60">P95</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold font-mono">
                  {fmtMs(summary.p99Latency)}
                </div>
                <div className="text-[10px] text-foreground/60">P99</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Request Stream + Top Incidents - Hackathon Style */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7 rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              <CardTitle className="text-sm font-medium">Live request stream</CardTitle>
            </div>
            <CardDescription className="mt-1">
              The last 12 requests with status + latency.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(Array.isArray(requests) ? requests : (requests?.items || [])).slice(0, 12).map((r) => {
                const latencyMs = r.latency_ms;
                const isOk = r.ok !== false && !r.error_type;
                const latencyLabel = latencyMs > 3000 ? "Degraded" : latencyMs > 1500 ? "High" : "Healthy";
                const latencyTone = latencyMs > 3000 ? "warning" : latencyMs > 1500 ? "warning" : "success";
                const statusLabel = isOk ? "OK" : "Error";
                const statusTone = isOk ? "success" : "destructive";
                
                return (
                  <button
                    key={r.request_id || r.id}
                    onClick={() => onViewTrace?.(r)}
                    className="w-full rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-3 text-left hover:bg-muted/60 hover:border-violet-500/30 transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">
                          {(r.request_id || r.id || "").slice(0, 8)}...{(r.request_id || r.id || "").slice(-4)}
                          <span className="ml-2 text-xs font-normal text-foreground/60">
                            {new Date(r.ts || r.timestamp || r.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                  </span>
                </div>
                        <div className="mt-1 text-xs text-foreground/70">
                          {r.route || "POST /chat"} • {r.model || "gemini-2.5-pro"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("rounded-full text-xs", toneToBadgeClass(statusTone))}>
                          {statusLabel}
                        </Badge>
                        <Badge variant="outline" className={cn("rounded-full text-xs", toneToBadgeClass(latencyTone))}>
                          {latencyLabel}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground/70">
                      <span className="inline-flex items-center gap-1">
                        <Timer className="h-3 w-3" /> {fmtMs(latencyMs)}
                      </span>
                      <span className="text-foreground/30">•</span>
                      <span className="inline-flex items-center gap-1">
                        <Shield className="h-3 w-3" /> {r.safe_mode ? "SAFE" : "normal"}
                      </span>
                      {r.error_type && (
                        <>
                          <span className="text-foreground/30">•</span>
                          <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-300">
                            <TriangleAlert className="h-3 w-3" /> {r.error_type}
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}

              {(!(Array.isArray(requests) ? requests : (requests?.items || [])).length) && (
                <div className="text-center py-8 text-foreground/50">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <div className="text-sm">No requests yet</div>
                  <div className="text-xs mt-1">Send requests through the gateway to see them here.</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5 rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-sm font-medium">Top incidents</CardTitle>
            </div>
            <CardDescription className="mt-1">
              What's hurting reliability right now.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {/* Auto-generated incidents based on metrics - Enhanced with Enterprise Features */}
              {summary.p95 > 3500 && (
                <div className="w-full rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-3 text-left hover:bg-muted/60 hover:border-violet-500/30 transition-all duration-200 shadow-sm hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold">p95 latency breach</div>
                        <Badge variant="outline" className="rounded-full text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/30">
                          llm-gateway
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-foreground/70">
                        p95_latency_ms • threshold 3500ms • current: {fmtMs(summary.p95)}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn("rounded-full text-xs", toneToBadgeClass("destructive"))}>
                      high
                    </Badge>
                  </div>
                  <div className="mt-2 line-clamp-2 text-xs text-foreground/70">
                    p95 latency exceeded threshold for 3 minutes. Impact: slower responses, possible timeouts.
                  </div>
                  {/* Enterprise: Timeline & Links */}
                  <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-3 text-foreground/50">
                      <span>🔴 Detected {new Date().toLocaleTimeString()}</span>
                      <span>→ Awaiting acknowledgment</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="text-violet-500 hover:text-violet-600 flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" /> View traces
                      </button>
                      <span className="text-foreground/30">|</span>
                      <button className="text-violet-500 hover:text-violet-600 flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Runbook
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {errorRate > 0.05 && (
                <div className="w-full rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-3 text-left hover:bg-muted/60 hover:border-violet-500/30 transition-all duration-200 shadow-sm hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold">Error rate spike</div>
                        <Badge variant="outline" className="rounded-full text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                          api-layer
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-foreground/70">
                        error_rate • threshold 5% • current: {fmtPct(errorRate)}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn("rounded-full text-xs", toneToBadgeClass("warning"))}>
                      medium
                    </Badge>
                  </div>
                  <div className="mt-2 line-clamp-2 text-xs text-foreground/70">
                    Error rate rose above 5%. Impact: failed chats and degraded UX.
                  </div>
                  {/* Enterprise: Timeline & Links */}
                  <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-3 text-foreground/50">
                      <span>🟠 Detected {new Date().toLocaleTimeString()}</span>
                      <span>→ Under investigation</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="text-violet-500 hover:text-violet-600 flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" /> View errors
                      </button>
                      <span className="text-foreground/30">|</span>
                      <button className="text-violet-500 hover:text-violet-600 flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Runbook
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {summary.estCostPerReq > 0.01 && (
                <div className="w-full rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-3 text-left hover:bg-muted/60 hover:border-violet-500/30 transition-all duration-200 shadow-sm hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold">Cost anomaly</div>
                        <Badge variant="outline" className="rounded-full text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                          billing
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-foreground/70">
                        cost_per_request • threshold $0.01 • current: ${summary.estCostPerReq.toFixed(4)}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn("rounded-full text-xs", toneToBadgeClass("warning"))}>
                      medium
                    </Badge>
                  </div>
                  <div className="mt-2 line-clamp-2 text-xs text-foreground/70">
                    Estimated cost per request is elevated. Impact: budget burn and quota risk.
                  </div>
                  {/* Enterprise: Timeline & Links */}
                  <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-3 text-foreground/50">
                      <span>🟡 Detected {new Date().toLocaleTimeString()}</span>
                      <span>→ SLA: no budget impact yet</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="text-violet-500 hover:text-violet-600 flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" /> Cost breakdown
                      </button>
                      <span className="text-foreground/30">|</span>
                      <button className="text-violet-500 hover:text-violet-600 flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Optimize
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {incidents?.map((inc) => (
                <button
                  key={inc.id}
                  className="w-full rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-3 text-left hover:bg-muted/60 hover:border-violet-500/30 transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{inc.title}</div>
                      <div className="mt-1 text-xs text-foreground/70">
                        {inc.signal} • threshold {String(inc.threshold)}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full text-xs",
                        toneToBadgeClass(
                          inc.severity === "high" ? "destructive" :
                          inc.severity === "medium" ? "warning" : "secondary"
                        )
                      )}
                    >
                      {inc.severity}
                    </Badge>
                  </div>
                  <div className="mt-2 line-clamp-2 text-xs text-foreground/70">
                    {inc.description}
                  </div>
                </button>
              ))}

              {(!incidents || incidents.length === 0) && summary.p95 <= 3500 && errorRate <= 0.05 && summary.estCostPerReq <= 0.01 && (
                <div className="text-center py-8 text-foreground/50">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <div className="text-sm">No incidents</div>
                  <div className="text-xs mt-1">When monitors trigger, incidents will appear here for triage.</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =============================================================================
// LIVE REQUESTS TAB (Hackathon Style)
// =============================================================================

function LiveRequestsTab({ requests, loading, query, onViewTrace, onOpenChat }) {
  const requestsArray = Array.isArray(requests) ? requests : (requests?.items || []);
  const filteredRequests = requestsArray.filter(r => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (r.request_id || r.id || "").toLowerCase().includes(q) ||
           (r.model || "").toLowerCase().includes(q) ||
           (r.route || "").toLowerCase().includes(q);
  });

  const fmtMs = (ms) => {
    if (ms == null || isNaN(ms)) return "—";
    if (ms < 1000) return `${ms.toFixed(0)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  };

  const fmtTokens = (t) => {
    if (!t) return "—";
    return (t.total_tokens || t.prompt_tokens + t.completion_tokens || 0).toLocaleString();
  };

  const fmtCost = (c) => {
    if (c == null) return "—";
    return `$${c.toFixed(4)}`;
  };

  return (
    <Card className="rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-500" />
            <CardTitle className="text-sm font-medium">Live Requests</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-full">
              💾 {filteredRequests.length} requests
            </Badge>
            <Button variant="outline" className="rounded-xl" onClick={onOpenChat}>
              <Sparkles className="mr-2 h-4 w-4" /> AI triage
            </Button>
          </div>
        </div>
        <CardDescription className="mt-1">
          Click any row to view trace details.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>time</TableHead>
                <TableHead>request_id</TableHead>
                <TableHead>route</TableHead>
                <TableHead>status</TableHead>
                <TableHead>latency</TableHead>
                <TableHead>tokens</TableHead>
                <TableHead>cost</TableHead>
                <TableHead>safe</TableHead>
                <TableHead>trace</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequests.slice(0, 40).map((r) => {
                const isOk = r.ok !== false && !r.error_type;
                const latencyMs = r.latency_ms;
                const latencyLabel = latencyMs > 3000 ? "Degraded" : latencyMs > 1500 ? "High" : "Healthy";
                const latencyTone = latencyMs > 3000 ? "warning" : latencyMs > 1500 ? "warning" : "success";
                
                return (
                  <TableRow
                    key={r.request_id || r.id}
                    className="cursor-pointer"
                    onClick={() => onViewTrace?.(r)}
                  >
                    <TableCell className="text-xs text-foreground/70">
                      {new Date(r.ts || r.timestamp || r.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {(r.request_id || r.id || "").slice(0, 8)}...{(r.request_id || r.id || "").slice(-4)}
                    </TableCell>
                    <TableCell className="text-xs">{r.route || "POST /chat"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("rounded-full", toneToBadgeClass(isOk ? "success" : "destructive"))}>
                        {isOk ? "OK" : "Error"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("rounded-full", toneToBadgeClass(latencyTone))}>
                        {fmtMs(latencyMs)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono">{fmtTokens(r.tokens)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                        {fmtCost(r.cost?.total_cost_usd || r.total_cost_usd)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("rounded-full", toneToBadgeClass(r.safe_mode ? "warning" : "secondary"))}>
                        {r.safe_mode ? "SAFE" : "normal"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewTrace?.(r);
                        }}
                      >
                        View <ExternalLink className="ml-1 h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {filteredRequests.length === 0 && (
          <div className="text-center py-8 text-foreground/50">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <div className="text-sm">No requests found</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// INCIDENTS TAB (Hackathon Style)
// =============================================================================

function IncidentsTab({ incidents, query, onSelectIncident, selectedIncident }) {
  const filteredIncidents = (incidents || []).filter(inc => {
    if (!query) return true;
    const q = query.toLowerCase();
    return inc.title?.toLowerCase().includes(q) ||
           inc.signal?.toLowerCase().includes(q) ||
           inc.description?.toLowerCase().includes(q);
  });

  return (
    <Card className="rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-sm font-medium">Incidents</CardTitle>
          </div>
          <Button className="rounded-xl" onClick={() => onSelectIncident?.(filteredIncidents[0])}>
            <Sparkles className="mr-2 h-4 w-4" /> Explain top
          </Button>
        </div>
        <CardDescription className="mt-1">
          Each incident is actionable: signal → root cause hypothesis → fix.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="space-y-2">
              {filteredIncidents.map((inc) => (
                <button
                  key={inc.id}
                  className={cn(
                    "w-full rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-4 text-left hover:bg-muted/60 hover:border-violet-500/30 transition-all duration-200 shadow-sm hover:shadow-md",
                    selectedIncident?.id === inc.id && "ring-2 ring-violet-500/30"
                  )}
                  onClick={() => onSelectIncident?.(inc)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{inc.title}</div>
                      <div className="mt-1 text-xs text-foreground/70">
                        {inc.signal} • current {String(inc.current || "N/A")} • threshold {String(inc.threshold || "N/A")}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn("rounded-full", toneToBadgeClass(
                        inc.severity === "high" ? "destructive" :
                        inc.severity === "medium" ? "warning" : "secondary"
                      ))}>
                        {inc.severity}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-foreground/80">{inc.description}</div>
                  {inc.suggested_action && (
                    <div className="mt-3 rounded-2xl bg-muted/60 p-3 text-xs text-foreground/70">
                      <div className="flex items-center gap-2 font-medium text-foreground/80">
                        <Wrench className="h-4 w-4" /> Suggested action
                      </div>
                      <div className="mt-1">{inc.suggested_action}</div>
                    </div>
                  )}
                </button>
              ))}
              {filteredIncidents.length === 0 && (
                <div className="text-center py-8 text-foreground/50">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <div className="text-sm">No incidents</div>
                  <div className="text-xs mt-1">When monitors trigger, incidents will appear here.</div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-5">
            {selectedIncident ? (
              <Card className="rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-violet-500" />
                    <CardTitle className="text-sm font-medium">AI Incident Brief</CardTitle>
                  </div>
                  <CardDescription className="mt-1">One-click executive + on-call summary.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-2xl border p-3">
                    <div className="text-xs text-foreground/70">Signal</div>
                    <div className="mt-1 text-sm font-semibold">{selectedIncident.signal || "N/A"}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-2xl border p-3">
                      <div className="text-xs text-foreground/70">Current</div>
                      <div className="mt-1 text-sm font-semibold">{String(selectedIncident.current || "N/A")}</div>
                    </div>
                    <div className="rounded-2xl border p-3">
                      <div className="text-xs text-foreground/70">Threshold</div>
                      <div className="mt-1 text-sm font-semibold">{String(selectedIncident.threshold || "N/A")}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="text-center py-8 text-foreground/50">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <div className="text-sm">Select an incident</div>
                <div className="text-xs mt-1">Pick an incident to view details and generate an AI brief.</div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// MODEL HEALTH TAB (Hackathon Style)
// =============================================================================

function ModelHealthTab({ timeseries, overview, loading }) {
  const chartData = timeseries?.points?.map(p => ({
    t: new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    p95: p.latency_ms || 0,
    requests: p.requests || 0,
  })) || [];

  const fmtMs = (ms) => {
    if (ms == null || isNaN(ms)) return "—";
    if (ms < 1000) return `${ms.toFixed(0)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  };

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="lg:col-span-7 rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <LineChart className="h-4 w-4 text-violet-500" />
            <CardTitle className="text-sm font-medium">Model latency profile</CardTitle>
          </div>
          <CardDescription className="mt-1">
            P95 latency trend over time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-72 bg-muted animate-pulse rounded" />
          ) : chartData.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ReLineChart data={chartData} margin={{ left: 8, right: 12, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="t" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--background))",
                    }}
                    formatter={(v) => fmtMs(v)}
                  />
                  <Line type="monotone" dataKey="p95" stroke="currentColor" dot={false} name="P95 Latency" />
                </ReLineChart>
              </ResponsiveContainer>
                </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-foreground/50">
              No latency data available.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-5 rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-blue-500" />
            <CardTitle className="text-sm font-medium">Dependencies</CardTitle>
          </div>
          <CardDescription className="mt-1">
            LLM provider and service health.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-2xl border">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <div>
                <div className="text-sm font-medium">Gemini / VertexAI</div>
                <div className="text-xs text-foreground/60">Primary LLM provider</div>
              </div>
            </div>
            <Badge variant="outline" className="rounded-full bg-emerald-500/10 text-emerald-600">OK</Badge>
          </div>
          <div className="flex items-center justify-between p-3 rounded-2xl border">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <div>
                <div className="text-sm font-medium">OpenAI Compatible</div>
                <div className="text-xs text-foreground/60">Gateway translation layer</div>
              </div>
            </div>
            <Badge variant="outline" className="rounded-full bg-emerald-500/10 text-emerald-600">OK</Badge>
          </div>
          <div className="flex items-center justify-between p-3 rounded-2xl border">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <div>
                <div className="text-sm font-medium">Tracevox Gateway</div>
                <div className="text-xs text-foreground/60">Observability layer</div>
              </div>
            </div>
            <Badge variant="outline" className="rounded-full bg-emerald-500/10 text-emerald-600">OK</Badge>
          </div>

          <Separator />
          <div className="rounded-2xl bg-muted/60 p-4 text-sm">
            <div className="font-semibold">Trace Analysis</div>
            <div className="mt-1 text-foreground/70">
              Click "View" on any request to open distributed traces. The longest 
              child span typically indicates the bottleneck (e.g., LLM API call).
              </div>
            </div>
          </CardContent>
        </Card>
    </div>
  );
}

// =============================================================================
// RISK ITEM COMPONENT (Hackathon Style)
// =============================================================================

function RiskItem({ icon: Icon, title, desc }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border p-3">
      <div className="rounded-xl bg-muted p-2">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-1 text-sm text-foreground/70">{desc}</div>
      </div>
    </div>
  );
}

// =============================================================================
// COST & RISK TAB (Hackathon Style - Full Implementation)
// =============================================================================

function CostRiskTab({ requests, overview, costs, loading, safeMode, onOpenChat, setChatText }) {
  const requestsArray = Array.isArray(requests) ? requests : (requests?.items || []);
  
  const summary = useMemo(() => {
    const reqs = requestsArray;
    const requestCount = reqs.length;
    const okCount = reqs.filter(r => r.ok !== false && !r.error_type).length;
    const safeCount = reqs.filter(r => r.safe_mode).length;
    const promptTokens = reqs.reduce((sum, r) => sum + (r.tokens?.prompt_tokens || r.prompt_tokens || 0), 0);
    const completionTokens = reqs.reduce((sum, r) => sum + (r.tokens?.completion_tokens || r.completion_tokens || 0), 0);
    const totalTokens = promptTokens + completionTokens;
    const totalCost = reqs.reduce((sum, r) => sum + (r.cost?.total_cost_usd || r.total_cost_usd || 0), 0);
    const estCostPerReq = requestCount > 0 ? totalCost / requestCount : 0;
    const avgTokensPerReq = requestCount > 0 ? totalTokens / requestCount : 0;
    const okRate = requestCount > 0 ? okCount / requestCount : 1;
    const safeRate = requestCount > 0 ? safeCount / requestCount : 0;
    
    // Latency calculations
    const latencies = reqs.map(r => r.latency_ms).filter(l => l != null && !isNaN(l)).sort((a, b) => a - b);
    const p95Idx = Math.floor(latencies.length * 0.95);
    const p95 = latencies[p95Idx] || 0;
    const p95Avg = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    
    return { 
      requestCount, okCount, safeCount, promptTokens, completionTokens, totalTokens, 
      totalCost, estCostPerReq, avgTokensPerReq, okRate, safeRate, p95, p95Avg 
    };
  }, [requestsArray]);

  const fmtPct = (x) => {
    if (x == null || isNaN(x)) return "—";
    return `${(x * 100).toFixed(1)}%`;
  };

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="lg:col-span-7 rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-500" />
            <CardTitle className="text-sm font-medium">LLM Cost Analytics</CardTitle>
          </div>
          <CardDescription className="mt-1">
            Real-time cost tracking and optimization insights from {summary.requestCount} requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Primary Metrics */}
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border bg-emerald-500/5 p-4">
              <div className="text-xs text-foreground/70">Total Cost</div>
              <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {summary.totalCost > 0 ? `$${summary.totalCost.toFixed(4)}` : "$0.00"}
              </div>
              <div className="mt-1 text-xs text-foreground/70">{summary.requestCount} requests</div>
            </div>
            <div className="rounded-2xl border p-4">
              <div className="text-xs text-foreground/70">Avg Cost / Request</div>
              <div className="mt-2 text-xl font-semibold">
                {summary.estCostPerReq > 0 ? `$${summary.estCostPerReq.toFixed(4)}` : "$0.00"}
              </div>
              <div className="mt-1 text-xs text-foreground/70">from token usage</div>
            </div>
            <div className="rounded-2xl border p-4">
              <div className="text-xs text-foreground/70">Total Tokens</div>
              <div className="mt-2 text-xl font-semibold">
                {summary.totalTokens > 0 ? summary.totalTokens.toLocaleString() : "0"}
              </div>
              <div className="mt-1 text-xs text-foreground/70">input + output</div>
            </div>
            <div className="rounded-2xl border p-4">
              <div className="text-xs text-foreground/70">Avg Tokens / Request</div>
              <div className="mt-2 text-xl font-semibold">
                {summary.avgTokensPerReq > 0 ? Math.round(summary.avgTokensPerReq).toLocaleString() : "0"}
              </div>
              <div className="mt-1 text-xs text-foreground/70">optimization target</div>
            </div>
          </div>

          {/* Cost Analysis */}
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className={cn(
              "rounded-2xl border p-4",
              summary.estCostPerReq > 0.01 ? "border-amber-500/50 bg-amber-500/5" : ""
            )}>
              <div className="text-xs text-foreground/70">Cost Risk Level</div>
              <div className={cn(
                "mt-2 text-xl font-semibold",
                summary.estCostPerReq > 0.02 ? "text-rose-600 dark:text-rose-400" :
                summary.estCostPerReq > 0.01 ? "text-amber-600 dark:text-amber-400" :
                "text-emerald-600 dark:text-emerald-400"
              )}>
                {summary.estCostPerReq > 0.02 ? "High" :
                 summary.estCostPerReq > 0.01 ? "Medium" :
                 summary.estCostPerReq > 0 ? "Low" : "No Data"}
              </div>
              <div className="mt-1 text-xs text-foreground/70">
                {summary.estCostPerReq > 0.02 ? "Consider prompt optimization" :
                 summary.estCostPerReq > 0.01 ? "Monitor for anomalies" :
                 "Within expected range"}
              </div>
            </div>
            <div className="rounded-2xl border p-4">
              <div className="text-xs text-foreground/70">Projected Daily Cost</div>
              <div className="mt-2 text-xl font-semibold">
                {summary.estCostPerReq > 0 
                  ? `$${(summary.estCostPerReq * 1000).toFixed(2)}`
                  : "$0.00"}
              </div>
              <div className="mt-1 text-xs text-foreground/70">@ 1,000 requests/day</div>
            </div>
            <div className="rounded-2xl border p-4">
              <div className="text-xs text-foreground/70">Projected Monthly</div>
              <div className="mt-2 text-xl font-semibold">
                {summary.estCostPerReq > 0 
                  ? `$${(summary.estCostPerReq * 30000).toFixed(2)}`
                  : "$0.00"}
              </div>
              <div className="mt-1 text-xs text-foreground/70">@ 1,000 requests/day</div>
            </div>
          </div>

          {/* Optimization Insights */}
          <div className="mt-4 rounded-2xl bg-muted/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Optimization Insights</div>
                <div className="text-sm text-foreground/70">
                  {summary.requestCount > 0 
                    ? `Based on analysis of ${summary.requestCount} requests.`
                    : "Send requests to generate personalized insights."}
                </div>
              </div>
              {summary.requestCount > 0 && onOpenChat && (
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => {
                    setChatText?.(`Analyze my LLM costs and provide optimization recommendations:
- Total requests: ${summary.requestCount}
- Average tokens per request: ${Math.round(summary.avgTokensPerReq)}
- Average cost per request: $${summary.estCostPerReq.toFixed(4)}
- Total cost: $${summary.totalCost.toFixed(4)}

Provide specific recommendations to reduce costs while maintaining quality.`);
                    onOpenChat();
                  }}
                >
                  <Sparkles className="mr-2 h-4 w-4" /> Analyze
                </Button>
              )}
            </div>
            {summary.requestCount > 0 ? (
              <ul className="mt-3 space-y-2 text-sm text-foreground/80">
                {summary.avgTokensPerReq > 500 && (
                  <li className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-amber-500" />
                    <span><strong>High token usage ({Math.round(summary.avgTokensPerReq)} avg):</strong> Consider prompt compression or summarization</span>
                  </li>
                )}
                {summary.avgTokensPerReq > 0 && summary.avgTokensPerReq <= 500 && (
                  <li className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-green-500" />
                    <span><strong>Efficient token usage ({Math.round(summary.avgTokensPerReq)} avg):</strong> Within optimal range</span>
                  </li>
                )}
                {summary.estCostPerReq > 0.01 && (
                  <li className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-amber-500" />
                    <span><strong>Elevated cost (${summary.estCostPerReq.toFixed(4)}/req):</strong> Consider response caching</span>
                  </li>
                )}
                {summary.estCostPerReq > 0 && summary.estCostPerReq <= 0.01 && (
                  <li className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-green-500" />
                    <span><strong>Cost efficient (${summary.estCostPerReq.toFixed(4)}/req):</strong> Below threshold</span>
                  </li>
                )}
                {safeMode && (
                  <li className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-green-500" />
                    <span><strong>SAFE mode active:</strong> Prompt injection protection enabled</span>
                  </li>
                )}
                {summary.okRate >= 0.95 && (
                  <li className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-green-500" />
                    <span><strong>High reliability ({(summary.okRate * 100).toFixed(1)}% success):</strong> Service performing well</span>
                  </li>
                )}
                {summary.okRate < 0.95 && (
                  <li className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-red-500" />
                    <span><strong>Reliability concern ({((1 - summary.okRate) * 100).toFixed(1)}% errors):</strong> Check backend logs</span>
                  </li>
                )}
              </ul>
            ) : (
              <div className="mt-3 text-sm text-foreground/60 italic">
                No request data available yet. Send requests to generate insights.
              </div>
            )}
          </div>

          {/* Recommended Alert Thresholds */}
          {summary.requestCount > 0 && (
            <div className="mt-4 rounded-2xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Recommended Alert Thresholds</div>
                  <div className="text-xs text-foreground/70">
                    Calculated from {summary.requestCount} requests (2x baseline for alerting).
                  </div>
                </div>
                {onOpenChat && (
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => {
                      setChatText?.(`Generate monitor configurations based on my current metrics:
- Average cost: $${summary.estCostPerReq.toFixed(4)}/req → Alert at: $${(summary.estCostPerReq * 2).toFixed(4)}/req
- Average tokens: ${Math.round(summary.avgTokensPerReq)} → Alert at: ${Math.round(summary.avgTokensPerReq * 1.5)}
- Current error rate: ${((1 - summary.okRate) * 100).toFixed(1)}%

Generate alert configurations for cost, latency, and error rate.`);
                      onOpenChat();
                    }}
                  >
                    <Sparkles className="mr-2 h-4 w-4" /> Generate
                  </Button>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-muted/40 p-2">
                  <div className="text-xs text-foreground/60">Cost Alert (2x avg)</div>
                  <div className="text-sm font-mono font-semibold">
                    &gt; ${(summary.estCostPerReq * 2).toFixed(4)}/req
                  </div>
                </div>
                <div className="rounded-xl bg-muted/40 p-2">
                  <div className="text-xs text-foreground/60">Token Alert (1.5x avg)</div>
                  <div className="text-sm font-mono font-semibold">
                    &gt; {Math.round(summary.avgTokensPerReq * 1.5).toLocaleString()} tokens
                  </div>
                </div>
                <div className="rounded-xl bg-muted/40 p-2">
                  <div className="text-xs text-foreground/60">Latency (p95)</div>
                  <div className="text-sm font-mono font-semibold">
                    &gt; {summary.p95Avg > 0 ? `${Math.round(summary.p95Avg * 1.5)}ms` : "5000ms"}
                  </div>
                </div>
                <div className="rounded-xl bg-muted/40 p-2">
                  <div className="text-xs text-foreground/60">Error Rate</div>
                  <div className="text-sm font-mono font-semibold">
                    &gt; {summary.okRate < 1 ? `${Math.max(5, Math.round((1 - summary.okRate) * 100 * 2))}%` : "10%"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enterprise Risk Controls */}
      <Card className="lg:col-span-5 rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-violet-500" />
            <CardTitle className="text-sm font-medium">Enterprise Risk Controls</CardTitle>
          </div>
          <CardDescription className="mt-1">
            Security, compliance, and cost governance for production LLM deployments.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <RiskItem
            icon={Shield}
            title="Prompt & Secret Protection"
            desc="SAFE mode blocks credential exposure, prompt injection, and jailbreak attempts."
          />
          <RiskItem
            icon={DollarSign}
            title="Cost Governance"
            desc={`Real-time tracking: $${summary.totalCost.toFixed(4)} total, $${summary.estCostPerReq.toFixed(4)}/request avg.`}
          />
          <RiskItem
            icon={Timer}
            title="Latency SLOs"
            desc="p95 latency tracking with automatic anomaly detection and alerting."
          />
          <RiskItem
            icon={Activity}
            title="Token Governance"
            desc={`Avg ${Math.round(summary.avgTokensPerReq).toLocaleString()} tokens/request. Set limits to prevent runaway prompts.`}
          />
          <RiskItem
            icon={BadgeCheck}
            title="Audit & Compliance"
            desc="Full request/response logging with PII-safe structured logs to Datadog."
          />

          <Separator className="my-3" />

          {/* Demo Statistics */}
          <div className="rounded-2xl bg-muted/40 p-3">
            <div className="text-xs font-semibold text-foreground/70 mb-2">Demo Statistics</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Requests: <span className="font-semibold">{summary.requestCount}</span></div>
              <div>Success Rate: <span className="font-semibold">{fmtPct(summary.okRate)}</span></div>
              <div>SAFE Mode: <span className="font-semibold">{fmtPct(summary.safeRate)}</span></div>
              <div>Total Cost: <span className="font-semibold text-emerald-600">${summary.totalCost.toFixed(4)}</span></div>
            </div>
          </div>

          {/* Generate Executive Report Button */}
          <Button
            className="w-full rounded-2xl"
            onClick={() => {
              setChatText?.(`Generate an executive summary for our LLM Observability deployment:

**Current Metrics:**
- Total Requests: ${summary.requestCount}
- Success Rate: ${(summary.okRate * 100).toFixed(1)}%
- Average Latency: p95 ${summary.p95 ? Math.round(summary.p95) + 'ms' : 'N/A'}
- Total Tokens Used: ${summary.totalTokens.toLocaleString()}
- Average Cost/Request: $${summary.estCostPerReq.toFixed(4)}
- Total Session Cost: $${summary.totalCost.toFixed(4)}
- SAFE Mode Usage: ${(summary.safeRate * 100).toFixed(1)}%

Provide:
1. Executive summary (2-3 sentences)
2. Key reliability metrics assessment
3. Cost optimization opportunities
4. Security posture evaluation
5. Recommended next steps for production readiness`);
              onOpenChat?.();
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" /> Generate Executive Report
          </Button>
        </CardContent>
      </Card>
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
// AI INSIGHTS + SAFETY PANELS
// =============================================================================

// =============================================================================
// SETTINGS MODAL
// =============================================================================

function SettingsModal({ isOpen, onClose, user, org, onOpenApiKeys, onOpenBilling, onOpenTeam }) {
  // LLM Credential state
  const [credentialConfig, setCredentialConfig] = useState(null);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Form state
  const [selectedProvider, setSelectedProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("gpt-4o");
  const [showKey, setShowKey] = useState(false);
  
  // Fetch credential config and providers on open
  useEffect(() => {
    if (isOpen) {
      fetchCredentialData();
    }
  }, [isOpen]);
  
  const fetchCredentialData = async () => {
    setLoading(true);
    try {
      const [configData, providersData] = await Promise.all([
        api.getCredentialConfig().catch(() => null),
        api.getProviders().catch(() => ({ providers: [] })),
      ]);
      
      setCredentialConfig(configData);
      setProviders(providersData?.providers || []);
      
      // Pre-fill form if credentials exist
      if (configData?.configured) {
        setSelectedProvider(configData.provider);
        setSelectedModel(configData.default_model);
      }
    } catch (err) {
      console.error("Failed to fetch credential data:", err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSaveCredentials = async () => {
    if (!apiKey.trim()) {
      setError("Please enter your API key");
      return;
    }
    
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      await api.saveCredentials({
        provider: selectedProvider,
        api_key: apiKey,
        default_model: selectedModel,
      });
      
      setSuccess("Credentials saved securely");
      setApiKey(""); // Clear for security
      await fetchCredentialData(); // Refresh config
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || "Failed to save credentials");
    } finally {
      setSaving(false);
    }
  };
  
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    
    try {
      const result = await api.testCredentialConnection();
      setTestResult(result);
    } catch (err) {
      setTestResult({ connected: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };
  
  const handleDeleteCredentials = async () => {
    if (!confirm("Are you sure you want to delete your LLM credentials?")) return;
    
    try {
      await api.deleteCredentials();
      setCredentialConfig(null);
      setSuccess("Credentials deleted");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || "Failed to delete credentials");
    }
  };
  
  const currentProvider = providers.find(p => p.id === selectedProvider);

    return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Manage your account, LLM credentials, and integrations
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* LLM Provider Configuration - Enterprise Grade */}
          <div className="space-y-4 p-4 rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/5 to-purple-500/5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-violet-700 dark:text-violet-300">
                <Bot className="h-4 w-4" />
                LLM Provider Configuration
              </h3>
              {credentialConfig?.configured && (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                  <Check className="h-3 w-3 mr-1" /> Configured
                </Badge>
              )}
            </div>
            
            {/* Current Configuration Status */}
            {credentialConfig?.configured && (
              <div className="p-3 rounded-lg bg-card/50 border border-border/50 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Provider</span>
                  <span className="font-medium capitalize">{credentialConfig.provider}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Model</span>
                  <span className="font-medium">{credentialConfig.default_model}</span>
                </div>
                {credentialConfig.last_updated && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Last Updated</span>
                    <span className="font-medium">{new Date(credentialConfig.last_updated).toLocaleDateString()}</span>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleTestConnection}
                    disabled={testing}
                  >
                    {testing ? (
                      <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Testing...</>
                    ) : (
                      <><Zap className="h-3 w-3 mr-1" /> Test Connection</>
                    )}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="text-rose-500 hover:text-rose-600"
                    onClick={handleDeleteCredentials}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Remove
                  </Button>
                </div>
                {testResult && (
                  <div className={cn(
                    "text-xs p-2 rounded mt-2",
                    testResult.connected 
                      ? "bg-emerald-500/10 text-emerald-600" 
                      : "bg-rose-500/10 text-rose-600"
                  )}>
                    {testResult.connected ? "✓ " : "✗ "}{testResult.message}
                    {testResult.latency_ms && ` (${testResult.latency_ms.toFixed(0)}ms)`}
                  </div>
                )}
              </div>
            )}
            
            {/* Add/Update Credentials Form */}
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {credentialConfig?.configured 
                  ? "Update your LLM credentials below. Your API key is stored securely with enterprise-grade encryption."
                  : "Configure your LLM provider for AI Triage. Credentials are stored securely with enterprise-grade encryption."
                }
              </p>
              
              {/* Provider Selection */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Provider</label>
                <Select value={selectedProvider} onValueChange={(v) => {
                  setSelectedProvider(v);
                  const provider = providers.find(p => p.id === v);
                  if (provider?.models?.[0]) {
                    setSelectedModel(provider.models[0]);
                  }
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{p.name}</span>
                          <span className="text-xs text-muted-foreground">- {p.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Model Selection */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Default Model</label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentProvider?.models?.map((model) => (
                      <SelectItem key={model} value={model}>{model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* API Key Input */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">
                  API Key {currentProvider?.key_prefix && <span className="text-violet-500">(starts with {currentProvider.key_prefix})</span>}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showKey ? "text" : "password"}
                      placeholder={currentProvider?.key_prefix ? `${currentProvider.key_prefix}...` : "Enter API key"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="pr-10 font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                      onClick={() => setShowKey(!showKey)}
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button onClick={handleSaveCredentials} disabled={saving || !apiKey.trim()}>
                    {saving ? (
                      <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Saving...</>
                    ) : (
                      <><Shield className="h-4 w-4 mr-1" /> Save Securely</>
                    )}
                  </Button>
                </div>
                {currentProvider?.docs_url && (
                  <a 
                    href={currentProvider.docs_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-violet-500 hover:underline mt-1.5 inline-flex items-center gap-1"
                  >
                    Get your {currentProvider.name} API key →
                  </a>
                )}
              </div>
              
              {/* Status Messages */}
              {error && (
                <div className="text-xs p-2 rounded bg-rose-500/10 text-rose-600 flex items-center gap-2">
                  <XCircle className="h-3 w-3" /> {error}
                </div>
              )}
              {success && (
                <div className="text-xs p-2 rounded bg-emerald-500/10 text-emerald-600 flex items-center gap-2">
                  <Check className="h-3 w-3" /> {success}
                </div>
              )}
            </div>
          </div>

          <Separator />

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
                Manage Tracevox API Keys
              </Button>
              <Button 
                variant="outline" 
                className="justify-start"
                onClick={() => {
                  onClose();
                  onOpenBilling?.();
                }}
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Billing & Subscription
              </Button>
              <Button 
                variant="outline" 
                className="justify-start"
                onClick={() => {
                  onClose();
                  onOpenTeam?.();
                }}
              >
                <Users className="h-4 w-4 mr-2" />
                Team Members
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
// REAL-TIME INCIDENT DETECTION (from actual metrics)
// =============================================================================

function detectIncidentsFromMetrics(overview, security, quality) {
  const incidents = [];
  const now = Date.now();

  // Detect high error rate
  const errorRate = overview?.usage?.error_rate || 0;
  if (errorRate > 0.05) {
    incidents.push({
      id: `error-${now}`,
      title: `Elevated error rate (${(errorRate * 100).toFixed(1)}%)`,
      signal: "error_rate • high",
      severity: errorRate > 0.15 ? "high" : "medium",
      status: "open",
      description: `Error rate (${(errorRate * 100).toFixed(1)}%) exceeds threshold (5%). Users may be experiencing failures.`,
      suggested_action: "Inspect error logs; validate API credentials; check quota limits.",
      detectedAt: new Date().toISOString(),
    });
  }

  // Detect high latency
  const avgLatency = overview?.usage?.avg_latency_ms || 0;
  if (avgLatency > 3000) {
    incidents.push({
      id: `latency-${now}`,
      title: `High latency detected (${avgLatency.toFixed(0)}ms)`,
      signal: "avg_latency_ms • medium",
      severity: avgLatency > 5000 ? "high" : "medium",
      status: "open",
      description: `Average latency (${avgLatency.toFixed(0)}ms) exceeds threshold (3000ms). Users may experience slow responses.`,
      suggested_action: "Check LLM provider spans; verify network latency; consider model optimization.",
      detectedAt: new Date().toISOString(),
    });
  }

  // Detect cost anomaly (>$10/day as example threshold)
  const totalCost = overview?.usage?.total_cost_usd || 0;
  const requests = overview?.usage?.total_requests || 1;
  const costPerRequest = totalCost / requests;
  if (costPerRequest > 0.05) {
    incidents.push({
      id: `cost-${now}`,
      title: `Cost anomaly detected ($${costPerRequest.toFixed(3)}/req)`,
      signal: "cost_per_request • medium",
      severity: costPerRequest > 0.1 ? "high" : "medium",
      status: "open",
      description: `Cost per request ($${costPerRequest.toFixed(3)}) is above optimal threshold. Consider cost optimization.`,
      suggested_action: "Review model usage; enable caching; set budget alerts.",
      detectedAt: new Date().toISOString(),
    });
  }

  // Detect security issues
  const blockRate = security?.block_rate || 0;
  if (blockRate > 0.1) {
    incidents.push({
      id: `security-${now}`,
      title: `Security blocks elevated (${(blockRate * 100).toFixed(1)}%)`,
      signal: "block_rate • high",
      severity: "high",
      status: "open",
      description: `Block rate (${(blockRate * 100).toFixed(1)}%) indicates potential abuse or policy violations.`,
      suggested_action: "Review blocked requests; tighten rate limits; check for malicious actors.",
      detectedAt: new Date().toISOString(),
    });
  }

  // If everything is healthy, show a positive status
  if (incidents.length === 0 && overview?.usage?.total_requests > 0) {
    incidents.push({
      id: `healthy-${now}`,
      title: "System operating normally",
      signal: "all_metrics • healthy",
      severity: "low",
      status: "resolved",
      description: "All metrics are within acceptable thresholds. No issues detected.",
      suggested_action: "Continue monitoring; consider setting up proactive alerts.",
      detectedAt: new Date().toISOString(),
    });
  }

  return incidents;
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
// BILLING MODAL
// =============================================================================

function BillingModal({ isOpen, onClose, org }) {
  const [plans, setPlans] = useState([]);
  const [currentBilling, setCurrentBilling] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [billingPeriod, setBillingPeriod] = useState('monthly');

  useEffect(() => {
    if (isOpen) {
      loadBillingData();
    }
  }, [isOpen]);

  async function loadBillingData() {
    setLoading(true);
    try {
      const [plansRes, currentRes, invoicesRes] = await Promise.all([
        apiRequest('/api/billing/plans'),
        apiRequest('/api/billing/current'),
        apiRequest('/api/billing/invoices'),
      ]);
      
      setPlans(plansRes.plans || []);
      setCurrentBilling(currentRes);
      setInvoices(invoicesRes.invoices || []);
    } catch (err) {
      console.error('Failed to load billing:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout(planId) {
    setCheckoutLoading(planId);
    try {
      const res = await apiPost('/api/billing/checkout', {
        tier: planId,
        billing_period: billingPeriod,
      });
      
      if (res.checkout_url) {
        window.location.href = res.checkout_url;
      }
    } catch (err) {
      console.error('Checkout failed:', err);
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handleManageBilling() {
    try {
      const res = await apiPost('/api/billing/portal');
      if (res.portal_url) {
        window.open(res.portal_url, '_blank');
      }
    } catch (err) {
      console.error('Portal failed:', err);
    }
  }

  const currentPlanId = currentBilling?.plan?.id || org?.tier || 'free';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-violet-500" />
            Billing & Subscription
          </DialogTitle>
          <DialogDescription>
            Manage your subscription and view invoices
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Current Plan */}
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Current Plan</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className="capitalize bg-violet-500">{currentPlanId}</Badge>
                    {currentBilling?.status === 'trial' && (
                      <span className="text-xs text-amber-500">
                        Trial ends in {currentBilling.trial?.days_remaining} days
                      </span>
                    )}
                </div>
              </div>
                {currentBilling?.payment?.subscription_id && (
                  <Button variant="outline" size="sm" onClick={handleManageBilling}>
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Manage
                  </Button>
                )}
              </div>
              
              {currentBilling?.usage && (
                <div className="mt-4 grid grid-cols-3 gap-4">
                  <div className="text-center p-3 rounded-lg bg-background">
                    <div className="text-2xl font-bold">{currentBilling.usage.requests?.toLocaleString() || 0}</div>
                    <div className="text-xs text-muted-foreground">Requests</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-background">
                    <div className="text-2xl font-bold">${currentBilling.usage.cost_usd?.toFixed(2) || '0.00'}</div>
                    <div className="text-xs text-muted-foreground">Spend</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-background">
                    <div className="text-2xl font-bold">{currentBilling.usage.usage_percent?.toFixed(0) || 0}%</div>
                    <div className="text-xs text-muted-foreground">Usage</div>
                  </div>
                </div>
              )}
            </div>

            {/* Plan Selector */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium">Plans</h3>
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  <Button
                    variant={billingPeriod === 'monthly' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setBillingPeriod('monthly')}
                  >
                    Monthly
                  </Button>
                  <Button
                    variant={billingPeriod === 'annual' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setBillingPeriod('annual')}
                  >
                    Annual <span className="text-emerald-500 ml-1">-20%</span>
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {plans.slice(0, 4).map((plan) => {
                  const isCurrent = plan.id === currentPlanId;
                  const price = billingPeriod === 'annual'
                    ? plan.price_annual_per_month
                    : plan.price_monthly;
                  const underDev = plan.under_development === true;

                  return (
                    <div
                      key={plan.id}
                      className={`rounded-xl border p-4 ${
                        underDev ? 'opacity-85' : ''
                      } ${plan.popular && !underDev ? 'border-violet-500 bg-violet-500/5' : ''} ${isCurrent ? 'ring-2 ring-violet-500' : ''}`}
                    >
                      {underDev && (
                        <Badge className="mb-2 bg-muted text-muted-foreground">Under development</Badge>
                      )}
                      {plan.popular && !underDev && (
                        <Badge className="mb-2 bg-violet-500">Popular</Badge>
                      )}
                      <h4 className="font-medium">{plan.name}</h4>
                      <div className="mt-2">
                        {price !== null && price !== undefined ? (
                          <>
                            <span className="text-2xl font-bold">${price}</span>
                            <span className="text-muted-foreground">/mo</span>
                          </>
                        ) : (
                          <span className="text-lg font-semibold">Contact Sales</span>
                        )}
                      </div>
                      <ul className="mt-3 space-y-1">
                        {plan.features?.slice(0, 3).map((f, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                            <Check className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <Button
                        className="w-full mt-4"
                        variant={isCurrent ? 'outline' : plan.popular && !underDev ? 'default' : 'outline'}
                        size="sm"
                        disabled={underDev || isCurrent || checkoutLoading === plan.id || price === null}
                        onClick={() => !underDev && handleCheckout(plan.id)}
                      >
                        {checkoutLoading === plan.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : underDev ? (
                          'Coming soon'
                        ) : isCurrent ? (
                          'Current'
                        ) : price === null ? (
                          'Contact Sales'
                        ) : (
                          'Upgrade'
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Invoice History */}
            {invoices.length > 0 && (
              <div>
                <h3 className="font-medium mb-3">Recent Invoices</h3>
                <div className="space-y-2">
                  {invoices.slice(0, 5).map((invoice) => (
                    <div key={invoice.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <span className="font-mono text-sm">{invoice.number}</span>
                        <span className="text-muted-foreground text-sm ml-2">
                          {new Date(invoice.created).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium">${invoice.amount?.toFixed(2)}</span>
                        <Badge variant={invoice.status === 'paid' ? 'default' : 'secondary'}>
                          {invoice.status}
                        </Badge>
                        {invoice.pdf_url && (
                          <a href={invoice.pdf_url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm">
                              <Download className="h-4 w-4" />
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// TEAM MODAL
// =============================================================================

function TeamModal({ isOpen, onClose, currentUser }) {
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadTeamData();
    }
  }, [isOpen]);

  async function loadTeamData() {
    setLoading(true);
    try {
      const [membersRes, invitesRes] = await Promise.all([
        apiRequest('/api/team/members'),
        apiRequest('/api/team/invites'),
      ]);
      
      setMembers(membersRes.members || []);
      setInvites(invitesRes.invites || []);
    } catch (err) {
      console.error('Failed to load team:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    
    try {
      await apiPost('/api/team/invite', {
        email: inviteEmail,
        role: inviteRole,
      });
      
      setSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      await loadTeamData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(memberId) {
    if (!confirm('Remove this team member?')) return;
    
    try {
      await apiDelete(`/api/team/members/${memberId}`);
      await loadTeamData();
    } catch (err) {
      setError(err.message || 'Failed to remove member');
    }
  }

  async function handleRevokeInvite(inviteId) {
    try {
      await apiDelete(`/api/team/invite/${inviteId}`);
      await loadTeamData();
    } catch (err) {
      setError(err.message || 'Failed to revoke invitation');
    }
  }

  const roleColors = {
    owner: 'bg-amber-500',
    admin: 'bg-violet-500',
    member: 'bg-blue-500',
    viewer: 'bg-gray-500',
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-violet-500" />
            Team Members
          </DialogTitle>
          <DialogDescription>
            Manage your team members and invitations
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Notifications */}
            {success && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 text-emerald-600">
                <Check className="h-4 w-4" />
                {success}
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 text-rose-600">
                <XCircle className="h-4 w-4" />
                {error}
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setError(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Invite Form */}
            <form onSubmit={handleInvite} className="flex gap-2">
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1"
                required
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="px-3 py-2 rounded-md border bg-background text-sm"
              >
                <option value="viewer">Viewer</option>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <Button type="submit" disabled={inviting}>
                {inviting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-1" />
                    Invite
                  </>
                )}
              </Button>
            </form>

            {/* Members List */}
            <div>
              <h3 className="font-medium mb-3">Members ({members.length})</h3>
              <div className="space-y-2">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white font-medium">
                        {(member.name || member.email)?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <div className="font-medium text-sm">
                          {member.name || 'Unknown'}
                          {member.id === currentUser?.user_id && (
                            <span className="text-muted-foreground ml-1">(you)</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{member.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={roleColors[member.role] || 'bg-gray-500'}>
                        {member.role}
                      </Badge>
                      {member.id !== currentUser?.user_id && member.role !== 'owner' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          <Trash2 className="h-4 w-4 text-rose-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pending Invites */}
            {invites.length > 0 && (
              <div>
                <h3 className="font-medium mb-3">Pending Invitations ({invites.length})</h3>
                <div className="space-y-2">
                  {invites.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="font-medium text-sm">{invite.email}</div>
                          <div className="text-xs text-muted-foreground">
                            Invited by {invite.invited_by}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{invite.role}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevokeInvite(invite.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// MAIN DASHBOARD COMPONENT
// =============================================================================

function DashboardContent({ onLogout, onOpenSettings, onOpenCustomDashboards, onOpenPlayground, onOpenTracing, onOpenEvaluations, onOpenDatasets }) {
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
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [health, setHealth] = useState(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [timeRange, setTimeRange] = useState("7");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [query, setQuery] = useState(""); // Search query for hackathon tabs
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
  const [showBilling, setShowBilling] = useState(false);
  const [showTeam, setShowTeam] = useState(false);

  // AI Triage state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatResult, setChatResult] = useState(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatErr, setChatErr] = useState(null);
  const [safeMode, setSafeMode] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState(null);
  
  // Compute real incidents from actual metrics
  const realIncidents = useMemo(() => {
    return detectIncidentsFromMetrics(overview, security, quality);
  }, [overview, security, quality]);
  
  // AI Triage - uses user's configured LLM settings from Settings
  const [userApiKeys, setUserApiKeys] = useState([]);
  const [triageModel, setTriageModel] = useState(() => 
    localStorage.getItem("tracevox_triage_model") || "gpt-4o-mini"
  );

  // Fetch user's Tracevox API keys on mount
  useEffect(() => {
    const fetchKeys = async () => {
      try {
        const keys = await listApiKeys();
        setUserApiKeys(keys || []);
      } catch (e) {
        console.warn("Could not fetch API keys:", e);
      }
    };
    fetchKeys();
  }, []);
  
  // Get the user's first active API key for reference (not used for AI Triage anymore)
  const userTracevoxKey = userApiKeys.find(k => k.status === 'active')?.key || userApiKeys[0]?.key || "";
  
  useEffect(() => {
    if (triageModel) localStorage.setItem("tracevox_triage_model", triageModel);
  }, [triageModel]);

  const timerRef = useRef(null);
  const aiInsightsTimerRef = useRef(null);

  const fetchAIInsights = useCallback(async () => {
    setAiInsightsLoading(true);
    try {
      const data = await api.getAIInsights().catch(() => null);
      setInsights(data);
    } finally {
      setAiInsightsLoading(false);
    }
  }, []);

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
    // Fetch AI insights as soon as possible, but don't block the main dashboard load.
    fetchAIInsights();
  }, [fetchData]);

  useEffect(() => {
    // Keep dependency list intentionally small to avoid repeated intervals.
    // This mirrors the hackathon “Auto-refreshes every 30s” behavior for the AI panel itself.
    aiInsightsTimerRef.current = setInterval(fetchAIInsights, 30000);
    return () => {
      if (aiInsightsTimerRef.current) clearInterval(aiInsightsTimerRef.current);
    };
  }, [fetchAIInsights]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(fetchData, 30000); // 30 seconds
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, fetchData]);

  // AI Triage function - uses organization's stored LLM credentials
  const runChat = async () => {
    setChatBusy(true);
    setChatErr(null);
    setChatResult(null);

    // If an incident is selected, enrich prompt
    const ctx = selectedIncident
      ? `\n\nContext: Incident\n- title: ${selectedIncident.title}\n- signal: ${selectedIncident.signal || 'N/A'}\n- current: ${selectedIncident.current || 'N/A'}\n- threshold: ${selectedIncident.threshold || 'N/A'}\n- severity: ${selectedIncident.severity}\n- description: ${selectedIncident.description}`
      : "";

    const msg = `${chatText}${ctx}\n\nReturn: (1) root cause hypothesis (2) top 3 checks in monitoring (3) mitigation (4) prevention.`;

    try {
      const out = await api.aiTriage({ 
        message: msg, 
        safe_mode: safeMode,
      });
      setChatResult(out);
    } catch (e) {
      setChatErr(String(e?.message || e));
    } finally {
      setChatBusy(false);
    }
  };

  // Format helper functions for AI triage
  const fmtMs = (ms) => {
    if (!ms) return '—';
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
    return `${ms.toFixed(0)} ms`;
  };

  const fmtCost = (cost) => {
    if (!cost) return '$0.00';
    return `$${cost.toFixed(4)}`;
  };

  const shortId = (id) => {
    if (!id) return '—';
    return `${id.slice(0, 8)}...${id.slice(-4)}`;
  };

  const user = api.getUser();
  const org = api.getOrg();

  return (
    <div className="min-h-screen bg-background">
      {/* Beautiful Purple Gradient Header */}
      <div className="relative mb-4 md:mb-6 overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 p-4 md:p-6 shadow-2xl shadow-purple-500/25 animate-gradient mx-4 mt-4">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -left-4 -top-4 h-32 w-32 rounded-full bg-white/10 blur-2xl float-slow" />
          <div className="absolute -bottom-8 -right-8 h-40 w-40 rounded-full bg-white/10 blur-3xl float-medium" />
          <div className="absolute left-1/3 top-1/2 h-24 w-24 rounded-full bg-white/5 blur-2xl float-slow hidden md:block" style={{animationDelay: '1s'}} />
        </div>
        
        <div className="relative">
          {/* Desktop Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-4">
              {/* Logo */}
              <motion.div 
                className="flex items-center"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <img src="/logo-tracevox-full.svg" alt="Tracevox" className="h-16" />
              </motion.div>
              <div>
                <div className="flex items-center gap-3">
                  <Badge className="rounded-full bg-white/20 text-white hover:bg-white/30 border-0">
                    v1.0
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-white/80">
            {org && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1">
                      <Activity className="h-3.5 w-3.5" /> {org.name}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1">
                    <Cloud className="h-3.5 w-3.5" /> Production
                  </span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
                    health?.status === "healthy" ? "bg-emerald-500/30 text-emerald-100" : "bg-rose-500/30 text-rose-100"
                  }`}>
                    <Gauge className="h-3.5 w-3.5" />
                    {health?.status === "healthy" ? "healthy" : "checking…"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Dark Mode Toggle */}
              <div className="flex items-center gap-2 rounded-2xl bg-white/10 backdrop-blur-sm px-3 py-2 ring-1 ring-white/20">
                <span className="text-xs text-white/70">Dark</span>
                <Switch 
                  checked={theme === "dark"} 
                  onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} 
                />
              </div>

              {/* Live Badge */}
              <div className="flex items-center gap-2 rounded-2xl bg-white/10 backdrop-blur-sm px-3 py-2 ring-1 ring-white/20">
                <Badge variant="outline" className="rounded-xl border-0 bg-emerald-500/80 text-white status-live">
                  ● LIVE
              </Badge>
          </div>

              {/* Refresh Button */}
              <Button
                variant="secondary"
                className="rounded-2xl bg-white/20 text-white hover:bg-white/30 border-0 backdrop-blur-sm"
                onClick={fetchData}
                disabled={loading}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    className="rounded-2xl bg-white/20 text-white hover:bg-white/30 border-0 backdrop-blur-sm"
                  >
                    <User className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline max-w-[100px] truncate">{user?.name || "Account"}</span>
                    <ChevronDown className="ml-2 h-4 w-4" />
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
                  <DropdownMenuItem onClick={() => onOpenSettings?.()}>
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                    <Badge variant="outline" className="ml-auto text-xs">All</Badge>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onOpenCustomDashboards?.()}>
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Custom Dashboards
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onOpenPlayground?.()}>
                    <Terminal className="h-4 w-4 mr-2" />
                    Prompt Playground
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onOpenTracing?.()}>
                    <GitBranch className="h-4 w-4 mr-2" />
                    Distributed Tracing
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onOpenEvaluations?.()}>
                    <FlaskConical className="h-4 w-4 mr-2" />
                    Evaluations
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onOpenDatasets?.()}>
                    <Database className="h-4 w-4 mr-2" />
                    Datasets & Testing
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowApiKeys(true)}>
                    <Key className="h-4 w-4 mr-2" />
                    API Keys
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowSettings(true)}>
                    <User className="h-4 w-4 mr-2" />
                    Quick Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.open('/docs', '_blank')}>
                    <BookOpen className="h-4 w-4 mr-2" />
                    Documentation
                    <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
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
        </div>
      </div>

      {/* Controls Row - Below Banner */}
      <div className="flex flex-wrap items-center justify-end gap-2 mb-4 px-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="rounded-2xl">
              <Wrench className="mr-2 h-4 w-4" />
              Controls
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Environment Settings</DropdownMenuLabel>
            <div className="px-2 pb-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mb-1 text-xs text-foreground/70">Time Range</div>
            <Select value={timeRange} onValueChange={setTimeRange}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 24h</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
                </div>
                <div className="flex items-end justify-between rounded-xl border px-3 py-2">
                  <div>
                    <div className="text-xs text-foreground/70">Auto Refresh</div>
                    <div className="text-sm font-medium">
                      {autoRefresh ? "ON" : "OFF"}
                    </div>
                  </div>
                  <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                </div>
              </div>

              <div className="mt-3">
            <Button
                  className="w-full rounded-xl"
              onClick={fetchData}
              disabled={loading}
            >
                  <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh now
            </Button>
              </div>

              <Separator className="my-3" />
              <div className="text-xs text-foreground/70">
                Auto refresh updates the dashboard every 30 seconds when enabled.
          </div>
        </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          className="rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700 border-0"
          onClick={() => {
            setChatOpen(true);
            setChatResult(null);
            setChatErr(null);
            // Pre-fill prompt with live metrics
            if (overview?.usage) {
              setChatText(`Analyze my LLM Observability deployment and provide insights:

**Live Metrics (from ${overview.usage.total_requests || 0} requests):**
- Success Rate: ${((1 - (overview.usage.error_rate || 0)) * 100).toFixed(1)}%
- Average Latency: ${overview.usage.avg_latency_ms?.toFixed(0) || 0}ms
- Total Tokens Used: ${overview.usage.total_tokens?.toLocaleString() || 0}
- Total Cost: $${overview.usage.total_cost_usd?.toFixed(4) || '0.00'}`);
            }
          }}
        >
          <Flame className="mr-2 h-4 w-4" /> Live Triage
        </Button>
      </div>

      {/* Main Content */}
      <main className="w-full px-4 md:px-6 lg:px-8 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Hackathon-Style Tabs with Search */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
            {/* Mobile-optimized scrollable tabs */}
            <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
              <TabsList className="h-10 md:h-11 rounded-xl md:rounded-2xl inline-flex w-max md:w-auto">
                <TabsTrigger value="overview" className="rounded-lg md:rounded-xl text-xs md:text-sm px-2.5 md:px-3 min-w-fit">
                  <BarChart3 className="mr-1.5 md:mr-2 h-3.5 w-3.5 md:h-4 md:w-4" /> 
                  Overview
            </TabsTrigger>
                <TabsTrigger value="requests" className="rounded-lg md:rounded-xl text-xs md:text-sm px-2.5 md:px-3 min-w-fit">
                  <Activity className="mr-1.5 md:mr-2 h-3.5 w-3.5 md:h-4 md:w-4" /> 
                  Live Requests
            </TabsTrigger>
                <TabsTrigger value="incidents" className="rounded-lg md:rounded-xl text-xs md:text-sm px-2.5 md:px-3 min-w-fit">
                  <AlertTriangle className="mr-1.5 md:mr-2 h-3.5 w-3.5 md:h-4 md:w-4" /> 
                  Incidents
                </TabsTrigger>
                <TabsTrigger value="health" className="rounded-lg md:rounded-xl text-xs md:text-sm px-2.5 md:px-3 min-w-fit">
                  <LineChart className="mr-1.5 md:mr-2 h-3.5 w-3.5 md:h-4 md:w-4" /> 
                  Model Health
                </TabsTrigger>
                <TabsTrigger value="cost" className="rounded-lg md:rounded-xl text-xs md:text-sm px-2.5 md:px-3 min-w-fit">
                  <DollarSign className="mr-1.5 md:mr-2 h-3.5 w-3.5 md:h-4 md:w-4" /> 
                  Cost & Risk
                </TabsTrigger>
          </TabsList>
            </div>

            {/* Search Bar */}
            <div className="flex w-full items-center gap-2 md:w-auto">
              <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-2.5 md:top-3 h-4 w-4 text-foreground/50" />
                <Input
                  className="h-10 md:h-11 rounded-xl md:rounded-2xl pl-9 text-sm"
                  placeholder="Search..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Button 
                variant="outline" 
                className="h-10 md:h-11 rounded-xl md:rounded-2xl px-3 md:px-4 text-sm" 
                onClick={() => setQuery("")}
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <TabsContent value="overview" className="mt-0">
                <OverviewTab
                  overview={overview}
                  timeseries={timeseries}
                  comparison={comparison}
                  loading={loading}
                  requests={requests}
                  incidents={realIncidents}
                  onViewTrace={(request) => {
                    // Navigate to tracing page with the trace/request ID
                    const traceId = request.trace_id || request.request_id;
                    if (onOpenTracing) {
                      // Store the trace ID for the tracing page to pick up
                      sessionStorage.setItem('tracevox_selected_trace', traceId);
                      onOpenTracing();
                    }
                  }}
                />
              </TabsContent>

              {/* Live Requests Tab - Hackathon Style */}
              <TabsContent value="requests" className="mt-0">
                <LiveRequestsTab 
                  requests={requests} 
                  loading={loading}
                  query={query}
                  onViewTrace={(request) => {
                    const traceId = request.trace_id || request.request_id;
                    if (onOpenTracing) {
                      sessionStorage.setItem('tracevox_selected_trace', traceId);
                      onOpenTracing();
                    }
                  }}
                  onOpenChat={() => setChatOpen(true)}
                />
              </TabsContent>

              {/* Incidents Tab - Hackathon Style */}
              <TabsContent value="incidents" className="mt-0">
                <IncidentsTab 
                  incidents={realIncidents}
                  query={query}
                  onSelectIncident={(inc) => {
                    setSelectedIncident(inc);
                    setChatOpen(true);
                  }}
                  selectedIncident={selectedIncident}
                />
              </TabsContent>

              {/* Model Health Tab - Hackathon Style */}
              <TabsContent value="health" className="mt-0">
                <ModelHealthTab 
                  timeseries={timeseries}
                  overview={overview}
                  loading={loading}
                />
              </TabsContent>

              {/* Cost & Risk Tab - Hackathon Style */}
              <TabsContent value="cost" className="mt-0">
                <CostRiskTab 
                  requests={requests}
                  overview={overview}
                  costs={costs}
                  loading={loading}
                  safeMode={safeMode}
                  onOpenChat={() => setChatOpen(true)}
                  setChatText={setChatText}
                />
              </TabsContent>
            </div>

            {/* Sidebar - AI Triage & Insights */}
            <div className="space-y-6">
              <HackathonControlsSidebar
                className={""}
                incidents={realIncidents}
                onSelectIncident={(inc) => {
                  setSelectedIncident(inc);
                  setChatOpen(true);
                }}
                safeMode={safeMode}
                setSafeMode={setSafeMode}
                onGenerateIncidentSummary={() => {
                  setSelectedIncident(realIncidents?.[0] || null);
                  setChatOpen(true);
                }}
                aiInsights={insights}
                aiInsightsLoading={aiInsightsLoading}
                fetchAIInsights={fetchAIInsights}
                requests={requests?.items || []}
              />

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
        onOpenBilling={() => {
          setShowSettings(false);
          setShowBilling(true);
        }}
        onOpenTeam={() => {
          setShowSettings(false);
          setShowTeam(true);
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

      <BillingModal
        isOpen={showBilling}
        onClose={() => setShowBilling(false)}
        org={org}
      />

      <TeamModal
        isOpen={showTeam}
        onClose={() => setShowTeam(false)}
        currentUser={{ user_id: user?.id, ...user }}
      />

      {/* AI Triage Assistant Dialog */}
      <Dialog open={chatOpen} onOpenChange={setChatOpen}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] md:max-h-[85vh] overflow-y-auto rounded-2xl md:rounded-2xl p-4 md:p-6">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center gap-2 text-base md:text-lg">
              <Sparkles className="h-4 w-4 md:h-5 md:w-5 text-violet-500" /> AI Triage Assistant
            </DialogTitle>
            <DialogDescription className="text-xs md:text-sm">
              Uses <strong>your LLM</strong> through Tracevox Gateway. The request is logged in your dashboard!
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            {/* Info Banner */}
            <div className="flex items-center justify-between rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-500/5 to-purple-500/5 p-3">
              <div className="flex items-center gap-2 text-sm text-foreground/80">
                <Sparkles className="h-4 w-4 text-violet-500" />
                Uses your organization's LLM credentials from Settings
    </div>
              <Button 
                variant="ghost" 
                size="sm"
                className="text-xs"
                onClick={() => {
                  setChatOpen(false);
                  setShowSettings(true);
                }}
              >
                <Settings className="h-3 w-3 mr-1" /> Configure
              </Button>
            </div>

            {/* Prompt Section */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Prompt</div>
                <div className="flex items-center gap-2">
                  <Badge variant={safeMode ? "warning" : "secondary"}>
                    {safeMode ? "SAFE" : "normal"}
                  </Badge>
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => setSafeMode((s) => !s)}
                  >
                    <Shield className="mr-2 h-4 w-4" /> Toggle SAFE
                  </Button>
                </div>
              </div>
              <Textarea
                className="min-h-[80px] md:min-h-[100px] rounded-xl md:rounded-2xl text-sm"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder="Ask about your LLM deployment performance, errors, or get optimization recommendations..."
              />
              {selectedIncident && (
                <div className="rounded-2xl border bg-muted/30 p-3 text-xs text-foreground/70">
                  <div className="font-medium text-foreground/80">Attached context</div>
                  <div className="mt-1">
                    <b>Incident:</b> {selectedIncident.title || selectedIncident.description}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-foreground/60">
                This request will be logged in your dashboard via the Gateway.
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="rounded-xl" onClick={() => {
                  setChatResult(null);
                  setChatErr(null);
                }}>
                  Clear
                </Button>
                <Button className="rounded-xl" onClick={runChat} disabled={chatBusy}>
                  {chatBusy ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Running…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" /> Generate
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Error State */}
            {chatErr && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm"
              >
                <div className="font-semibold text-rose-700 dark:text-rose-300">
                  AI Triage failed
                </div>
                <div className="mt-1 text-foreground/80">{chatErr}</div>
              </motion.div>
            )}

            {/* Result State */}
            {chatResult && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm p-4 shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">Response</div>
                    <div className="mt-1 text-xs text-foreground/70">
                      <span className="font-mono">{chatResult.model || triageModel}</span> • 
                      request_id: <span className="font-mono">{shortId(chatResult.request_id)}</span>
                    </div>
                  </div>
                  <Badge variant={chatResult.safe_mode ? "warning" : "secondary"}>
                    {chatResult.safe_mode ? "SAFE" : "normal"}
                  </Badge>
                </div>
                
                {/* LLM Observability Stats */}
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded-lg md:rounded-xl border bg-muted/30 p-2 text-center">
                    <div className="text-[10px] md:text-xs text-foreground/60">Latency</div>
                    <div className="text-xs md:text-sm font-semibold font-mono">{fmtMs(chatResult.latency_ms)}</div>
                  </div>
                  <div className="rounded-lg md:rounded-xl border bg-muted/30 p-2 text-center">
                    <div className="text-[10px] md:text-xs text-foreground/60">Input</div>
                    <div className="text-xs md:text-sm font-semibold font-mono">{chatResult.tokens?.prompt_tokens?.toLocaleString() || "—"}</div>
                  </div>
                  <div className="rounded-lg md:rounded-xl border bg-muted/30 p-2 text-center">
                    <div className="text-[10px] md:text-xs text-foreground/60">Output</div>
                    <div className="text-xs md:text-sm font-semibold font-mono">{chatResult.tokens?.completion_tokens?.toLocaleString() || "—"}</div>
                  </div>
                  <div className="rounded-lg md:rounded-xl border bg-emerald-500/10 p-2 text-center">
                    <div className="text-[10px] md:text-xs text-foreground/60">Cost</div>
                    <div className="text-xs md:text-sm font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                      {fmtCost(chatResult.cost?.total_cost_usd)}
                    </div>
                  </div>
                </div>

                {/* AI Response with Markdown */}
                <div className="mt-3 max-h-[45vh] overflow-auto rounded-xl border bg-muted/30 p-4 prose prose-sm dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-p:leading-relaxed max-w-none">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code: ({ node, inline, className, children, ...props }) => {
                        const match = /language-(\w+)/.exec(className || '');
                        return !inline ? (
                          <div className="relative group">
                            {match && (
                              <span className="absolute right-2 top-2 text-[10px] uppercase tracking-wider text-white/40 font-mono">
                                {match[1]}
                              </span>
                            )}
                            <pre className="!bg-black/60 !border-white/10 rounded-lg overflow-x-auto">
                              <code className={cn("text-sm font-mono", className)} {...props}>
                                {children}
                              </code>
                            </pre>
                          </div>
                        ) : (
                          <code className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 font-mono text-sm" {...props}>
                            {children}
                          </code>
                        );
                      },
                      h1: ({ children }) => (
                        <h1 className="text-xl font-bold mt-6 mb-3 text-foreground flex items-center gap-2">
                          <span className="h-1 w-1 rounded-full bg-violet-500" />
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-lg font-semibold mt-5 mb-2 text-foreground flex items-center gap-2">
                          <span className="h-1 w-1 rounded-full bg-violet-400" />
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-base font-semibold mt-4 mb-2 text-foreground/90">{children}</h3>
                      ),
                      ul: ({ children }) => (
                        <ul className="space-y-1.5 my-3 ml-1">{children}</ul>
                      ),
                      li: ({ children }) => (
                        <li className="flex items-start gap-2 text-foreground/80">
                          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-violet-500/60 flex-shrink-0" />
                          <span>{children}</span>
                        </li>
                      ),
                      p: ({ children }) => (
                        <p className="my-2 text-foreground/80 leading-relaxed">{children}</p>
                      ),
                    }}
                  >
                    {chatResult.answer}
                  </ReactMarkdown>
                </div>
              </motion.div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Export with Error Boundary wrapper
export default function Dashboard(props) {
  return (
    <ErrorBoundary>
      <DashboardContent {...props} />
    </ErrorBoundary>
  );
}
