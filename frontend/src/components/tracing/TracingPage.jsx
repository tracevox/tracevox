/**
 * Tracevox Distributed Tracing UI
 * 
 * Visualizes traces and spans with:
 * - Trace list with filtering
 * - Trace detail with waterfall visualization
 * - Span tree with nested structure
 * - Input/output inspection
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Box, CheckCircle,
  ChevronDown, ChevronRight, Clock, Code, Copy, DollarSign,
  ExternalLink, Filter, GitBranch, Layers, Loader2, MessageSquare,
  RefreshCw, Search, Sparkles, Tag, Terminal, Trash2, User,
  XCircle, Zap, AlertTriangle, Bot, Cpu, Database, Globe,
  Hash, Info, Play, Settings, Shield, Wrench
} from 'lucide-react';
import { cn } from '@/lib/utils';

// API functions - use the same API base as the rest of the app
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://api.tracevox.ai';

async function fetchTraces(params = {}) {
  const token = localStorage.getItem('tracevox_token');
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/api/tracing/traces?${query}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to fetch traces');
  return res.json();
}

async function fetchTrace(traceId) {
  const token = localStorage.getItem('tracevox_token');
  const res = await fetch(`${API_BASE}/api/tracing/traces/${traceId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to fetch trace');
  return res.json();
}

async function fetchTracingStats(days = 7) {
  const token = localStorage.getItem('tracevox_token');
  const res = await fetch(`${API_BASE}/api/tracing/stats?days=${days}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

// Span kind icons
const SPAN_KIND_ICONS = {
  llm: Bot,
  chain: GitBranch,
  agent: Sparkles,
  tool: Wrench,
  retrieval: Database,
  embedding: Cpu,
  generation: MessageSquare,
  evaluation: CheckCircle,
  custom: Box,
};

// Span kind colors
const SPAN_KIND_COLORS = {
  llm: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  chain: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  agent: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  tool: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  retrieval: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  embedding: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  generation: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  evaluation: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  custom: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};

// Status badges
function StatusBadge({ status }) {
  const styles = {
    active: 'bg-blue-500/20 text-blue-400',
    completed: 'bg-emerald-500/20 text-emerald-400',
    success: 'bg-emerald-500/20 text-emerald-400',
    error: 'bg-red-500/20 text-red-400',
    pending: 'bg-amber-500/20 text-amber-400',
    cancelled: 'bg-zinc-500/20 text-zinc-400',
    partial: 'bg-amber-500/20 text-amber-400',
  };
  
  const icons = {
    active: Loader2,
    completed: CheckCircle,
    success: CheckCircle,
    error: XCircle,
    pending: Clock,
    cancelled: XCircle,
    partial: AlertTriangle,
  };
  
  const Icon = icons[status] || Box;
  
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1', styles[status])}>
      <Icon className={cn('h-3 w-3', status === 'active' && 'animate-spin')} />
      {status}
    </span>
  );
}

// Span kind badge
function SpanKindBadge({ kind }) {
  const Icon = SPAN_KIND_ICONS[kind] || Box;
  const colors = SPAN_KIND_COLORS[kind] || SPAN_KIND_COLORS.custom;
  
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 border', colors)}>
      <Icon className="h-3 w-3" />
      {kind}
    </span>
  );
}

// Format duration
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

// Format cost
function formatCost(cost) {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(6)}`;
  return `$${cost.toFixed(4)}`;
}

// Format date
function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
}

// JSON viewer
function JsonViewer({ data, maxHeight = 200 }) {
  const [expanded, setExpanded] = useState(false);
  
  if (!data) return <span className="text-muted-foreground">null</span>;
  
  const jsonStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const isLong = jsonStr.length > 500;
  
  return (
    <div className="relative">
      <pre className={cn(
        'text-xs font-mono bg-zinc-900/50 rounded p-3 overflow-auto',
        !expanded && isLong && 'max-h-[200px]'
      )}>
        {jsonStr}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="absolute bottom-2 right-2 px-2 py-1 bg-zinc-800 rounded text-xs hover:bg-zinc-700"
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      )}
    </div>
  );
}

// Trace list item
function TraceListItem({ trace, selected, onClick }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={cn(
        'p-4 border rounded-lg cursor-pointer transition-all',
        selected 
          ? 'border-purple-500 bg-purple-500/10' 
          : 'border-border hover:border-purple-500/50 hover:bg-muted/50'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium truncate">{trace.name}</span>
            <StatusBadge status={trace.status} />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(trace.duration_ms)}
            </span>
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {trace.span_count} spans
            </span>
            <span className="flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              {formatCost(trace.total_cost_usd)}
            </span>
            {trace.error_count > 0 && (
              <span className="flex items-center gap-1 text-red-400">
                <XCircle className="h-3 w-3" />
                {trace.error_count} errors
              </span>
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {formatDate(trace.start_time)}
        </div>
      </div>
      
      {trace.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {trace.tags.slice(0, 3).map((tag, i) => (
            <span key={i} className="px-1.5 py-0.5 bg-muted rounded text-xs">
              {tag}
            </span>
          ))}
          {trace.tags.length > 3 && (
            <span className="text-xs text-muted-foreground">+{trace.tags.length - 3}</span>
          )}
        </div>
      )}
    </motion.div>
  );
}

// Waterfall bar for span visualization
function WaterfallBar({ span, traceStart, traceDuration, onClick, selected }) {
  const spanStart = new Date(span.start_time).getTime();
  const left = ((spanStart - traceStart) / traceDuration) * 100;
  const width = Math.max(1, (span.duration_ms / traceDuration) * 100);
  
  const colors = {
    llm: 'bg-purple-500',
    chain: 'bg-blue-500',
    agent: 'bg-amber-500',
    tool: 'bg-emerald-500',
    retrieval: 'bg-cyan-500',
    embedding: 'bg-pink-500',
    generation: 'bg-violet-500',
    evaluation: 'bg-teal-500',
    custom: 'bg-zinc-500',
  };
  
  return (
    <div
      onClick={onClick}
      className={cn(
        'absolute h-6 rounded cursor-pointer transition-all',
        colors[span.kind] || colors.custom,
        span.status === 'error' && 'bg-red-500',
        selected ? 'ring-2 ring-white' : 'hover:brightness-110'
      )}
      style={{
        left: `${left}%`,
        width: `${width}%`,
        minWidth: '4px',
      }}
      title={`${span.name}: ${formatDuration(span.duration_ms)}`}
    />
  );
}

// Span tree node
function SpanTreeNode({ span, level, selectedSpan, onSelect, traceStart, traceDuration }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = span.children && span.children.length > 0;
  const Icon = SPAN_KIND_ICONS[span.kind] || Box;
  
  return (
    <div>
      <div
        onClick={() => onSelect(span)}
        className={cn(
          'flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-all',
          selectedSpan?.id === span.id
            ? 'bg-purple-500/20 border border-purple-500/50'
            : 'hover:bg-muted/50'
        )}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="p-0.5 hover:bg-muted rounded"
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform', expanded && 'rotate-90')} />
          </button>
        ) : (
          <div className="w-5" />
        )}
        
        <Icon className={cn('h-4 w-4', SPAN_KIND_COLORS[span.kind]?.split(' ')[1])} />
        
        <span className="font-medium truncate flex-1">{span.name}</span>
        
        <StatusBadge status={span.status} />
        
        <span className="text-xs text-muted-foreground">{formatDuration(span.duration_ms)}</span>
        
        {span.model && (
          <span className="text-xs px-1.5 py-0.5 bg-muted rounded">{span.model}</span>
        )}
        
        {/* Inline waterfall bar */}
        <div className="w-32 h-2 bg-muted rounded overflow-hidden">
          <WaterfallBar
            span={span}
            traceStart={traceStart}
            traceDuration={traceDuration}
            onClick={() => {}}
            selected={false}
          />
        </div>
      </div>
      
      {hasChildren && expanded && (
        <div>
          {span.children.map((child) => (
            <SpanTreeNode
              key={child.id}
              span={child}
              level={level + 1}
              selectedSpan={selectedSpan}
              onSelect={onSelect}
              traceStart={traceStart}
              traceDuration={traceDuration}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Span detail panel
function SpanDetailPanel({ span, onClose }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = (text) => {
    navigator.clipboard.writeText(typeof text === 'string' ? text : JSON.stringify(text, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  if (!span) return null;
  
  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      className="w-96 border-l bg-background overflow-y-auto"
    >
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="font-semibold">Span Details</h3>
        <button onClick={onClose} className="p-1 hover:bg-muted rounded">
          <XCircle className="h-4 w-4" />
        </button>
      </div>
      
      <div className="p-4 space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <SpanKindBadge kind={span.kind} />
            <StatusBadge status={span.status} />
          </div>
          <h4 className="text-lg font-medium">{span.name}</h4>
          <p className="text-xs text-muted-foreground font-mono mt-1">{span.id}</p>
        </div>
        
        {/* Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="text-xs text-muted-foreground">Duration</div>
            <div className="text-lg font-semibold">{formatDuration(span.duration_ms)}</div>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="text-xs text-muted-foreground">Cost</div>
            <div className="text-lg font-semibold">{formatCost(span.metrics?.cost_usd || 0)}</div>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="text-xs text-muted-foreground">Prompt Tokens</div>
            <div className="text-lg font-semibold">{span.metrics?.prompt_tokens || 0}</div>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="text-xs text-muted-foreground">Completion Tokens</div>
            <div className="text-lg font-semibold">{span.metrics?.completion_tokens || 0}</div>
          </div>
        </div>
        
        {/* Model info */}
        {span.model && (
          <div>
            <h5 className="text-sm font-medium mb-2">Model</h5>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-sm">
                {span.model}
              </span>
              {span.provider && (
                <span className="text-xs text-muted-foreground">via {span.provider}</span>
              )}
            </div>
          </div>
        )}
        
        {/* Input */}
        {span.input && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-sm font-medium">Input</h5>
              <button
                onClick={() => handleCopy(span.input)}
                className="p-1 hover:bg-muted rounded"
              >
                {copied ? <CheckCircle className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
            <JsonViewer data={span.input} />
          </div>
        )}
        
        {/* Output */}
        {span.output && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-sm font-medium">Output</h5>
              <button
                onClick={() => handleCopy(span.output)}
                className="p-1 hover:bg-muted rounded"
              >
                {copied ? <CheckCircle className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
            <JsonViewer data={span.output} />
          </div>
        )}
        
        {/* Error */}
        {span.error && (
          <div>
            <h5 className="text-sm font-medium text-red-400 mb-2">Error</h5>
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              {span.error_type && (
                <div className="text-xs text-red-400 mb-1">{span.error_type}</div>
              )}
              <div className="text-sm">{span.error}</div>
            </div>
          </div>
        )}
        
        {/* Metadata */}
        {span.metadata && Object.keys(span.metadata).length > 0 && (
          <div>
            <h5 className="text-sm font-medium mb-2">Metadata</h5>
            <JsonViewer data={span.metadata} />
          </div>
        )}
        
        {/* Tags */}
        {span.tags?.length > 0 && (
          <div>
            <h5 className="text-sm font-medium mb-2">Tags</h5>
            <div className="flex flex-wrap gap-1">
              {span.tags.map((tag, i) => (
                <span key={i} className="px-2 py-0.5 bg-muted rounded text-xs">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* Timing */}
        <div>
          <h5 className="text-sm font-medium mb-2">Timing</h5>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Start</span>
              <span className="font-mono text-xs">{new Date(span.start_time).toISOString()}</span>
            </div>
            {span.end_time && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">End</span>
                <span className="font-mono text-xs">{new Date(span.end_time).toISOString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Trace detail view
function TraceDetailView({ trace, onBack }) {
  const [selectedSpan, setSelectedSpan] = useState(null);
  
  const traceStart = new Date(trace.start_time).getTime();
  const traceDuration = trace.duration_ms || 1;
  
  // Flatten spans for waterfall
  const flatSpans = useMemo(() => {
    const result = [];
    const flatten = (spans, level = 0) => {
      for (const span of spans) {
        result.push({ ...span, level });
        if (span.children) flatten(span.children, level + 1);
      }
    };
    flatten(trace.span_tree || []);
    return result;
  }, [trace.span_tree]);
  
  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="p-4 border-b">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to traces
          </button>
          
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl font-bold">{trace.name}</h2>
                <StatusBadge status={trace.status} />
              </div>
              <p className="text-sm text-muted-foreground font-mono">{trace.id}</p>
            </div>
            
            <div className="flex items-center gap-4 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold">{formatDuration(trace.duration_ms)}</div>
                <div className="text-muted-foreground">Duration</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{trace.span_count}</div>
                <div className="text-muted-foreground">Spans</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{trace.total_tokens.toLocaleString()}</div>
                <div className="text-muted-foreground">Tokens</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{formatCost(trace.total_cost_usd)}</div>
                <div className="text-muted-foreground">Cost</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Waterfall visualization */}
        <div className="p-4 border-b">
          <h3 className="text-sm font-medium mb-3">Waterfall</h3>
          <div className="relative h-40 bg-muted/30 rounded-lg overflow-hidden">
            {/* Time axis */}
            <div className="absolute bottom-0 left-0 right-0 h-6 border-t flex items-center justify-between px-2 text-xs text-muted-foreground">
              <span>0ms</span>
              <span>{formatDuration(traceDuration / 4)}</span>
              <span>{formatDuration(traceDuration / 2)}</span>
              <span>{formatDuration(traceDuration * 3 / 4)}</span>
              <span>{formatDuration(traceDuration)}</span>
            </div>
            
            {/* Spans */}
            <div className="absolute inset-0 bottom-6 p-2">
              {flatSpans.map((span, i) => (
                <div
                  key={span.id}
                  className="relative h-6 mb-1"
                  style={{ marginLeft: `${span.level * 20}px` }}
                >
                  <WaterfallBar
                    span={span}
                    traceStart={traceStart}
                    traceDuration={traceDuration}
                    onClick={() => setSelectedSpan(span)}
                    selected={selectedSpan?.id === span.id}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Span tree */}
        <div className="p-4">
          <h3 className="text-sm font-medium mb-3">Span Tree</h3>
          <div className="border rounded-lg overflow-hidden">
            {(trace.span_tree || []).map((span) => (
              <SpanTreeNode
                key={span.id}
                span={span}
                level={0}
                selectedSpan={selectedSpan}
                onSelect={setSelectedSpan}
                traceStart={traceStart}
                traceDuration={traceDuration}
              />
            ))}
          </div>
        </div>
        
        {/* Input/Output */}
        {(trace.input || trace.output) && (
          <div className="p-4 grid grid-cols-2 gap-4">
            {trace.input && (
              <div>
                <h3 className="text-sm font-medium mb-2">Trace Input</h3>
                <JsonViewer data={trace.input} />
              </div>
            )}
            {trace.output && (
              <div>
                <h3 className="text-sm font-medium mb-2">Trace Output</h3>
                <JsonViewer data={trace.output} />
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Span detail panel */}
      <AnimatePresence>
        {selectedSpan && (
          <SpanDetailPanel span={selectedSpan} onClose={() => setSelectedSpan(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// Stats cards
function StatsCards({ stats }) {
  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      <div className="p-4 bg-card border rounded-lg">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Activity className="h-4 w-4" />
          <span className="text-sm">Total Traces</span>
        </div>
        <div className="text-2xl font-bold">{stats.total_traces.toLocaleString()}</div>
      </div>
      <div className="p-4 bg-card border rounded-lg">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Layers className="h-4 w-4" />
          <span className="text-sm">Total Spans</span>
        </div>
        <div className="text-2xl font-bold">{stats.total_spans.toLocaleString()}</div>
      </div>
      <div className="p-4 bg-card border rounded-lg">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Clock className="h-4 w-4" />
          <span className="text-sm">Avg Latency</span>
        </div>
        <div className="text-2xl font-bold">{formatDuration(stats.avg_latency_ms)}</div>
      </div>
      <div className="p-4 bg-card border rounded-lg">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <DollarSign className="h-4 w-4" />
          <span className="text-sm">Total Cost</span>
        </div>
        <div className="text-2xl font-bold">{formatCost(stats.total_cost_usd)}</div>
      </div>
    </div>
  );
}

// Main Tracing Page
export function TracingPage({ onBack }) {
  const [traces, setTraces] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTrace, setSelectedTrace] = useState(null);
  const [traceDetail, setTraceDetail] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Load traces and check for pre-selected trace from dashboard
  useEffect(() => {
    loadTraces();
    loadStats();
    
    // Check if coming from dashboard with a selected trace
    const preSelectedTraceId = sessionStorage.getItem('tracevox_selected_trace');
    if (preSelectedTraceId) {
      sessionStorage.removeItem('tracevox_selected_trace');
      // Try to fetch the specific trace
      fetchTrace(preSelectedTraceId)
        .then(detail => {
          setTraceDetail(detail);
          setSelectedTrace({ id: preSelectedTraceId, ...detail });
        })
        .catch(err => {
          console.log('Could not load pre-selected trace:', err);
        });
    }
  }, [statusFilter]);
  
  async function loadTraces() {
    try {
      setLoading(true);
      const params = { limit: 50 };
      if (statusFilter) params.status = statusFilter;
      const data = await fetchTraces(params);
      setTraces(data);
    } catch (err) {
      console.error('Failed to load traces:', err);
    } finally {
      setLoading(false);
    }
  }
  
  async function loadStats() {
    try {
      const data = await fetchTracingStats(7);
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }
  
  async function selectTrace(trace) {
    setSelectedTrace(trace);
    try {
      const detail = await fetchTrace(trace.id);
      setTraceDetail(detail);
    } catch (err) {
      console.error('Failed to load trace detail:', err);
    }
  }
  
  // Filter traces by search
  const filteredTraces = useMemo(() => {
    if (!searchQuery) return traces;
    const q = searchQuery.toLowerCase();
    return traces.filter(t => 
      t.name.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      t.tags?.some(tag => tag.toLowerCase().includes(q))
    );
  }, [traces, searchQuery]);
  
  // Show trace detail view
  if (traceDetail) {
    return (
      <div className="min-h-screen bg-background">
        <TraceDetailView
          trace={traceDetail}
          onBack={() => { setTraceDetail(null); setSelectedTrace(null); }}
        />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-purple-500" />
              <h1 className="text-xl font-bold">Distributed Tracing</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={loadTraces}
              className="p-2 hover:bg-muted rounded-lg"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
          </div>
        </div>
      </header>
      
      <div className="p-6">
        {/* Stats */}
        {stats && <StatsCards stats={stats} />}
        
        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search traces..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg bg-background"
            />
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg bg-background"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="error">Error</option>
          </select>
        </div>
        
        {/* Trace list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTraces.length === 0 ? (
          <div className="text-center py-12">
            <GitBranch className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No traces yet</h3>
            <p className="text-muted-foreground">
              Traces will appear here once you start sending requests through Tracevox.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTraces.map((trace) => (
              <TraceListItem
                key={trace.id}
                trace={trace}
                selected={selectedTrace?.id === trace.id}
                onClick={() => selectTrace(trace)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TracingPage;

