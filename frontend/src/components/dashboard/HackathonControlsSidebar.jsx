import React from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Clock,
  ExternalLink,
  FileText,
  ListChecks,
  Shield,
  Sparkles,
  User,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

import {
  HackathonAIInsightsPanel,
  HackathonSafetyMetricsPanel,
} from "@/components/dashboard/HackathonAIInsightsPanel";

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

function Pill({ tone = "secondary", children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneToBadgeClass(
        tone
      )}`}
    >
      {children}
    </span>
  );
}

function SectionTitle({ icon: Icon, title, right }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="h-4 w-4 text-violet-500" /> : null}
        <div className="text-sm font-semibold">{title}</div>
      </div>
      {right}
    </div>
  );
}

/**
 * Hackathon Controls sidebar (right rail) extracted 1:1.
 *
 * This is intended to be mounted in the production dashboard in the exact same
 * column/span and vertical stacking so it visually matches the hackathon app.
 */
export function HackathonControlsSidebar({
  // Layout
  className,

  // Triage Queue
  incidents,
  onSelectIncident,

  // Policy & Guardrails
  safeMode,
  setSafeMode,
  onGenerateIncidentSummary,

  // AI Insights
  aiInsights,
  aiInsightsLoading,
  fetchAIInsights,

  // Safety Metrics
  requests,
}) {
  return (
    <div className={className || "lg:col-span-4"}>
      <Card className="rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
        <CardHeader>
          <SectionTitle
            icon={ListChecks}
            title="Triage Queue"
          />
          <CardDescription className="mt-1">
            Auto-detected incidents from real-time metrics analysis.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-2">
          {(incidents || []).slice(0, 6).map((inc) => (
            <motion.div
              key={inc.id}
              whileHover={{ scale: 1.01, y: -1 }}
              className="w-full rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-3 text-left hover:bg-muted/60 hover:border-violet-500/30 transition-all duration-200 shadow-sm hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold">{inc.title}</div>
                    <Badge variant="outline" className="text-[9px] h-4 bg-blue-500/10 text-blue-600 border-blue-500/30">
                      {inc.service || "llm-gateway"}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-foreground/70">
                    {inc.signal} • {inc.severity}
                  </div>
                </div>
                <Pill
                  tone={
                    inc.severity === "high"
                      ? "destructive"
                      : inc.severity === "medium"
                      ? "warning"
                      : "secondary"
                  }
                >
                  {inc.status}
                </Pill>
              </div>
              <div className="mt-2 line-clamp-2 text-xs text-foreground/70">
                {inc.description}
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-foreground/70">
                <ArrowRight className="h-3 w-3" />
                <span className="line-clamp-1">{inc.suggested_action}</span>
              </div>
              
              {/* Enterprise: Timeline & Quick Actions */}
              <div className="mt-2 pt-2 border-t border-border/30 flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-2 text-foreground/50">
                  <Clock className="h-3 w-3" />
                  <span>Detected {inc.detectedAt ? new Date(inc.detectedAt).toLocaleTimeString() : "just now"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => onSelectIncident?.(inc)}
                    className="text-violet-500 hover:text-violet-600 flex items-center gap-0.5"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                    <span>Details</span>
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
          
          {/* Empty state with helpful message */}
          {(!incidents || incidents.length === 0) && (
            <div className="text-center py-6 text-foreground/50">
              <ListChecks className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <div className="text-sm font-medium">All clear</div>
              <div className="text-xs mt-1">No active incidents. Monitors are watching.</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4 rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
        <CardHeader>
          <SectionTitle icon={Shield} title="Policy & Guardrails" />
          <CardDescription className="mt-1">
            SAFE mode, logging hygiene, and operational readiness.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-2xl border p-3">
            <div>
              <div className="text-sm font-semibold">SAFE mode</div>
              <div className="text-xs text-foreground/70">
                Refuse secrets, bypasses, and prompt extraction.
              </div>
            </div>
            <Switch checked={safeMode} onCheckedChange={setSafeMode} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border p-3">
              <div className="text-xs text-foreground/70">Tracing</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
                <BadgeCheck className="h-4 w-4" /> APM
              </div>
            </div>
            <div className="rounded-2xl border p-3">
              <div className="text-xs text-foreground/70">Metrics</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
                <BadgeCheck className="h-4 w-4" /> DogStatsD
              </div>
            </div>
            <div className="rounded-2xl border p-3">
              <div className="text-xs text-foreground/70">Logs</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
                <BadgeCheck className="h-4 w-4" /> JSON
              </div>
            </div>
            <div className="rounded-2xl border p-3">
              <div className="text-xs text-foreground/70">SLO</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4" /> p95
              </div>
            </div>
          </div>

          <Button className="w-full rounded-2xl" onClick={onGenerateIncidentSummary}>
            <Sparkles className="mr-2 h-4 w-4" /> Generate incident summary
          </Button>
        </CardContent>
      </Card>

      <HackathonAIInsightsPanel
        aiInsights={aiInsights}
        aiInsightsLoading={aiInsightsLoading}
        fetchAIInsights={fetchAIInsights}
      />

      <HackathonSafetyMetricsPanel aiInsights={aiInsights} requests={requests} />
    </div>
  );
}
