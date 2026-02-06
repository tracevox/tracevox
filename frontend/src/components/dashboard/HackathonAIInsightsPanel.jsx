import React, { useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Gauge,
  HelpCircle,
  Lightbulb,
  RefreshCw,
  Shield,
  Sparkles,
  TriangleAlert,
  Wrench,
  Zap,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Enterprise-grade AI Insights + Safety Metrics sidebar panels.
 * Enhanced with explainability hooks for enterprise buyers.
 */

// Explainable Insight Card with enterprise features
function InsightCard({ insight }) {
  const [expanded, setExpanded] = useState(false);
  
  const getSeverityColor = (severity) => {
    switch (severity) {
      case "critical": return "bg-rose-500/10 border-rose-500/30";
      case "warning": return "bg-amber-500/10 border-amber-500/30";
      default: return "bg-blue-500/10 border-blue-500/30";
    }
  };
  
  const getSeverityIcon = (severity) => {
    switch (severity) {
      case "critical": return <AlertTriangle className="h-3 w-3 text-rose-500" />;
      case "warning": return <TriangleAlert className="h-3 w-3 text-amber-500" />;
      default: return <Activity className="h-3 w-3 text-blue-500" />;
    }
  };

  // Simulated contributing signals based on insight type
  const getContributingSignals = (insight) => {
    if (insight.title?.includes("latency") || insight.title?.includes("Latency")) {
      return [
        { name: "p95_latency_ms", value: "3,847ms", trend: "↑ 23%" },
        { name: "time_to_first_token", value: "892ms", trend: "↑ 15%" },
        { name: "provider_response_time", value: "2,100ms", trend: "↑ 18%" },
      ];
    }
    if (insight.title?.includes("error") || insight.title?.includes("Error")) {
      return [
        { name: "error_rate", value: "5.2%", trend: "↑ 2.1%" },
        { name: "429_rate_limits", value: "12", trend: "↑ 8" },
        { name: "500_server_errors", value: "3", trend: "↑ 2" },
      ];
    }
    return [
      { name: "request_count", value: insight.detail?.match(/\d+/)?.[0] || "44", trend: "stable" },
      { name: "avg_tokens", value: "1,247", trend: "stable" },
    ];
  };

  return (
    <div className={`rounded-lg text-xs border ${getSeverityColor(insight.severity)}`}>
      {/* Main insight row */}
      <div 
        className="p-2 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="font-semibold flex items-center gap-1">
              {getSeverityIcon(insight.severity)}
              {insight.title}
            </div>
            <div className="text-foreground/70 mt-0.5">
              {insight.detail}
            </div>
          </div>
          <button className="text-violet-500 hover:text-violet-600 p-1">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        </div>
      </div>
      
      {/* Expanded explainability section */}
      {expanded && (
        <div className="border-t border-current/10 p-2 space-y-2 bg-white/5">
          {/* Contributing Signals */}
          <div>
            <div className="flex items-center gap-1 text-[10px] font-medium text-foreground/60 mb-1">
              <BarChart3 className="h-3 w-3" />
              Contributing Signals
            </div>
            <div className="space-y-1">
              {getContributingSignals(insight).map((signal, i) => (
                <div key={i} className="flex items-center justify-between text-[10px] p-1 rounded bg-background/50">
                  <span className="text-foreground/70">{signal.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{signal.value}</span>
                    <span className={signal.trend.includes("↑") ? "text-rose-500" : signal.trend.includes("↓") ? "text-emerald-500" : "text-foreground/50"}>
                      {signal.trend}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Correlated Metrics */}
          <div className="flex items-center gap-1 text-[10px] text-violet-500 cursor-pointer hover:text-violet-600">
            <Zap className="h-3 w-3" />
            <span>View correlated metrics</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </div>
          
          {/* Explain with AI */}
          <div className="flex items-center gap-2 pt-1 border-t border-current/10">
            <button className="flex items-center gap-1 text-[10px] text-violet-500 hover:text-violet-600">
              <Lightbulb className="h-3 w-3" />
              Explain this insight
            </button>
            <span className="text-foreground/30">|</span>
            <button className="flex items-center gap-1 text-[10px] text-violet-500 hover:text-violet-600">
              <HelpCircle className="h-3 w-3" />
              Why did this trigger?
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function HackathonAIInsightsPanel({
  aiInsights,
  aiInsightsLoading,
  fetchAIInsights,
}) {
  return (
    <Card className="mt-4 rounded-2xl shadow-lg bg-gradient-to-br from-violet-500/10 to-cyan-500/10 border-violet-500/30 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            AI Insights
            {aiInsights && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  aiInsights.risk_level === "critical"
                    ? "bg-rose-500/20 text-rose-500"
                    : aiInsights.risk_level === "high"
                    ? "bg-amber-500/20 text-amber-500"
                    : aiInsights.risk_level === "medium"
                    ? "bg-yellow-500/20 text-yellow-500"
                    : "bg-emerald-500/20 text-emerald-500"
                }`}
              >
                {aiInsights.risk_level || "low"}
              </span>
            )}
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={fetchAIInsights}
            disabled={aiInsightsLoading}
          >
            <RefreshCw
              className={`h-3 w-3 ${aiInsightsLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
        <CardDescription className="text-xs">
          Real-time LLM analysis • Auto-refreshes every 30s
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[480px] overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-violet-500/20 scrollbar-track-transparent">
          {aiInsightsLoading && !aiInsights ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-5 w-5 animate-spin text-violet-500" />
              <span className="ml-2 text-sm text-foreground/60">
                Analyzing metrics...
              </span>
            </div>
          ) : aiInsights ? (
            <>
              {/* Health Score - Enhanced with Source Info */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-background/50">
                <div
                  className={`text-3xl font-bold font-mono ${
                    aiInsights.health_score >= 80
                      ? "text-emerald-500"
                      : aiInsights.health_score >= 60
                      ? "text-amber-500"
                      : "text-rose-500"
                  }`}
                >
                  {aiInsights.health_score}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">Health Score</div>
                    <Badge variant="outline" className="text-[9px] h-4 bg-violet-500/10 text-violet-600 border-violet-500/30">
                      {aiInsights.source === "gemini" ? "Gemini" : aiInsights.source === "openai" ? "GPT" : "AI"} analyzed
                    </Badge>
                  </div>
                  <div className="text-[10px] text-foreground/50">
                    Updated{" "}
                    {aiInsights.timestamp
                      ? new Date(aiInsights.timestamp).toLocaleTimeString()
                      : "now"}
                    {aiInsights.from_cache && " (cached)"}
                  </div>
                </div>
                <button className="text-violet-500 hover:text-violet-600 p-1" title="Explain score calculation">
                  <HelpCircle className="h-4 w-4" />
                </button>
              </div>

              {/* Safety Metrics Summary */}
              {aiInsights.metrics_snapshot && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-center">
                    <div className="text-lg font-bold font-mono text-rose-500">
                      {(
                        aiInsights.metrics_snapshot.hallucination_rate * 100
                      ).toFixed(0)}
                      %
                    </div>
                    <div className="text-[10px] text-foreground/60">
                      Hallucination Risk
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                    <div className="text-lg font-bold font-mono text-amber-500">
                      {(aiInsights.metrics_snapshot.abuse_rate * 100).toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-foreground/60">
                      Abuse Attempts
                    </div>
                  </div>
                </div>
              )}

              {/* Insights - Enhanced with Enterprise Explainability */}
              {aiInsights.insights?.map((insight, i) => (
                <InsightCard key={i} insight={insight} />
              ))}

              {/* Predictions - Enhanced with Enterprise Features */}
              {aiInsights.predictions?.map((pred, i) => (
                <div
                  key={i}
                  className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/30 text-xs"
                >
                  <div className="flex items-start justify-between">
                    <div className="font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-1">
                      <Gauge className="h-3 w-3" />
                      Prediction
                    </div>
                    <Badge variant="outline" className="text-[9px] h-4 bg-violet-500/10 text-violet-600 border-violet-500/30">
                      AI-generated
                    </Badge>
                  </div>
                  <div className="text-foreground/70 mt-0.5">{pred.issue}</div>
                  <div className="text-[10px] text-foreground/50 mt-1 flex items-center justify-between">
                    <span>{pred.probability} • {pred.timeframe} • {pred.impact} impact</span>
                    <button className="text-violet-500 hover:text-violet-600 flex items-center gap-0.5">
                      <ExternalLink className="h-2.5 w-2.5" />
                      <span>Details</span>
                    </button>
                  </div>
                </div>
              ))}

              {/* Recommendations - Enhanced with Enterprise Features */}
              {aiInsights.recommendations?.map((rec, i) => (
                <div
                  key={i}
                  className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs"
                >
                  <div className="flex items-start justify-between">
                    <div className="font-semibold text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                      <Wrench className="h-3 w-3" />
                      {rec.priority === "high" ? "🔥 " : ""}Action: {rec.action}
                    </div>
                    <Badge variant="outline" className={`text-[9px] h-4 ${
                      rec.priority === "high" 
                        ? "bg-rose-500/10 text-rose-600 border-rose-500/30" 
                        : "bg-cyan-500/10 text-cyan-600 border-cyan-500/30"
                    }`}>
                      {rec.priority} priority
                    </Badge>
                  </div>
                  <div className="text-foreground/70 mt-0.5">{rec.reason}</div>
                  <div className="mt-1.5 pt-1 border-t border-current/10 flex items-center gap-2">
                    <button className="text-[10px] text-cyan-500 hover:text-cyan-600 flex items-center gap-0.5">
                      <Lightbulb className="h-2.5 w-2.5" />
                      View runbook
                    </button>
                    <span className="text-foreground/20">|</span>
                    <button className="text-[10px] text-cyan-500 hover:text-cyan-600 flex items-center gap-0.5">
                      <Zap className="h-2.5 w-2.5" />
                      Auto-fix
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="text-center text-xs text-foreground/50 py-6">
              <Sparkles className="h-6 w-6 mx-auto mb-2 opacity-30" />
              <div>AI analysis available when data is present</div>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 text-violet-500"
                onClick={fetchAIInsights}
              >
                Analyze Now
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function HackathonSafetyMetricsPanel({ aiInsights, requests }) {
  return (
    <Card className="mt-4 rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Shield className="h-4 w-4 text-emerald-500" />
          Safety Metrics
        </CardTitle>
        <CardDescription className="text-xs">
          Real-time quality signals (synced with AI Insights)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {(() => {
          // Use AI Insights metrics_snapshot for consistent data source
          const snapshot = aiInsights?.metrics_snapshot;
          const avgHallucination = snapshot?.hallucination_rate ?? 0;
          const avgAbuse = snapshot?.abuse_rate ?? 0;
          const avgPerformance = snapshot?.performance_score ?? 1;
          const avgQuality = snapshot?.response_quality ?? 1;
          const hasData = snapshot || (requests?.length || 0) > 0;

          if (!hasData) {
            return (
              <div className="text-center text-xs text-foreground/50 py-4">
                No request data yet
              </div>
            );
          }

          return (
            <>
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      avgHallucination > 0.5
                        ? "bg-rose-500"
                        : avgHallucination > 0.2
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                  />
                  <span className="text-xs">Hallucination Risk</span>
                </div>
                <span
                  className={`text-sm font-mono font-bold ${
                    avgHallucination > 0.5
                      ? "text-rose-500"
                      : avgHallucination > 0.2
                      ? "text-amber-500"
                      : "text-emerald-500"
                  }`}
                >
                  {(avgHallucination * 100).toFixed(0)}%
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      avgAbuse > 0 ? "bg-rose-500" : "bg-emerald-500"
                    }`}
                  />
                  <span className="text-xs">Abuse Rate</span>
                </div>
                <span
                  className={`text-sm font-mono font-bold ${
                    avgAbuse > 0 ? "text-rose-500" : "text-emerald-500"
                  }`}
                >
                  {(avgAbuse * 100).toFixed(0)}%
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      avgPerformance < 0.5
                        ? "bg-rose-500"
                        : avgPerformance < 0.8
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                  />
                  <span className="text-xs">Performance Score</span>
                </div>
                <span
                  className={`text-sm font-mono font-bold ${
                    avgPerformance < 0.5
                      ? "text-rose-500"
                      : avgPerformance < 0.8
                      ? "text-amber-500"
                      : "text-emerald-500"
                  }`}
                >
                  {(avgPerformance * 100).toFixed(0)}%
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      avgQuality < 0.5
                        ? "bg-rose-500"
                        : avgQuality < 0.8
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                  />
                  <span className="text-xs">Response Quality</span>
                </div>
                <span
                  className={`text-sm font-mono font-bold ${
                    avgQuality < 0.5
                      ? "text-rose-500"
                      : avgQuality < 0.8
                      ? "text-amber-500"
                      : "text-emerald-500"
                  }`}
                >
                  {(avgQuality * 100).toFixed(0)}%
                </span>
              </div>
            </>
          );
        })()}
      </CardContent>
    </Card>
  );
}
