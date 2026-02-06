/**
 * Tracevox - LLM Observability Platform
 * 
 * Production-ready application with real backend integration.
 * No demo, mock, or fake data - all data comes from real APIs.
 */

import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle,
  Copy,
  Check,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Mail,
  Plus,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import Dashboard from "@/components/dashboard/Dashboard";
import LandingPage from "@/components/LandingPage";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { CustomDashboardBuilder } from "@/components/dashboard/CustomDashboardBuilder";
import { Playground } from "@/components/playground/Playground";
import { DocsPage } from "@/components/docs/DocsPage.jsx";
import { TracingPage } from "@/components/tracing/TracingPage.jsx";
import EvaluationsPage from "@/components/evaluations/EvaluationsPage.jsx";
import DatasetsPage from "@/components/datasets/DatasetsPage.jsx";
import api, { 
  clearAuth, 
  signup, 
  login, 
  listApiKeys, 
  createApiKey, 
  revokeApiKey,
  getUser,
  getOrg,
} from "./lib/api";

// AUTH MODAL
function AuthModal({ isOpen, onClose, onSuccess }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (mode === "signup") {
        await signup({ email, password, name, company });
      } else {
        await login({ email, password });
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </DialogTitle>
          <DialogDescription>
            {mode === "login"
              ? "Sign in to access your dashboard"
              : "Start monitoring your LLM usage today"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10"
                    required
                  />
              </div>
            </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Company (Optional)</label>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Your company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="pl-10"
                  />
            </div>
          </div>
            </>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                required
              />
        </div>
        </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-10"
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
      </div>
    </div>

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
      </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : mode === "login" ? (
              <>
                <LogIn className="h-4 w-4 mr-2" />
                Sign In
              </>
            ) : (
              <>
                <ArrowRight className="h-4 w-4 mr-2" />
                Create Account
              </>
            )}
          </Button>

          <div className="text-center text-sm">
            {mode === "login" ? (
              <p>
                {"Don't have an account? "}
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="text-primary hover:underline"
                >
                  Sign up
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="text-primary hover:underline"
                >
                  Sign in
                </button>
              </p>
            )}
    </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ONBOARDING MODAL
function OnboardingModal({ isOpen, onClose }) {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (isOpen) {
      fetchOrCreateApiKey();
    }
  }, [isOpen]);

  const fetchOrCreateApiKey = async () => {
    try {
      const keys = await listApiKeys();
      if (keys && keys.length > 0) {
        const activeKey = keys.find(k => k.is_active);
        if (activeKey) {
          setApiKey(activeKey.prefix + "...");
        }
    } else {
        const newKey = await createApiKey({ name: "Default Key", environment: "production" });
        setApiKey(newKey.key);
      }
    } catch (error) {
      console.error("Failed to get API key:", error);
      setApiKey("Failed to load - please refresh");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleComplete = () => {
    localStorage.setItem("tracevox_onboarding_complete", "true");
    onClose();
  };

      return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Welcome to Tracevox!</DialogTitle>
          <DialogDescription>
            {"Let's get you set up in under 2 minutes"}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-muted">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Your API Key</span>
              <Button
                  variant="ghost"
                size="sm"
                  onClick={copyToClipboard}
                  disabled={loading}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
              </Button>
            </div>
              {loading ? (
                <div className="h-8 bg-background animate-pulse rounded" />
              ) : (
                <code className="text-sm font-mono break-all">{apiKey}</code>
              )}
              {!apiKey.includes("...") && (
                <p className="text-xs text-amber-500 mt-2">
                  Save this key now - you will not see it again!
                </p>
              )}
          </div>

            <Button onClick={() => setStep(2)} className="w-full">
              Next: Configure Your App
              <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="font-medium">Configure your LLM client:</h3>
              
              <div className="p-4 rounded-lg bg-muted font-mono text-sm overflow-x-auto">
                <pre>{`# Python (OpenAI SDK)
from openai import OpenAI

client = OpenAI(
    base_url="https://api.tracevox.ai/v1",
    api_key="YOUR_OPENAI_KEY",
    default_headers={
        "X-Tracevox-Key": "${apiKey}"
    }
)`}</pre>
        </div>
      </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={handleComplete} className="flex-1">
                <CheckCircle className="h-4 w-4 mr-2" />
                Complete Setup
                  </Button>
                </div>
                </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// API KEYS MODAL
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
          <DialogTitle>API Keys</DialogTitle>
          <DialogDescription>
            Manage your API keys for accessing the Tracevox gateway
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
              Copy this key now - you will not see it again!
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

        <div className="flex gap-2">
                <Input
            placeholder="Key name (e.g., Production, Development)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
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
            No API keys yet. Create one to get started.
                </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// MAIN APP
export default function App() {
  const [authenticated, setAuthenticated] = useState(() => {
    return !!localStorage.getItem("tracevox_token");
  });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showDashboard, setShowDashboard] = useState(() => {
    return window.location.pathname === "/dashboard";
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showCustomDashboards, setShowCustomDashboards] = useState(false);
  const [showPlayground, setShowPlayground] = useState(false);
  const [showDocs, setShowDocs] = useState(() => {
    return window.location.pathname === "/docs";
  });
  const [showTracing, setShowTracing] = useState(() => {
    return window.location.pathname === "/tracing";
  });
  const [showEvaluations, setShowEvaluations] = useState(() => {
    return window.location.pathname === "/evaluations";
  });
  const [showDatasets, setShowDatasets] = useState(() => {
    return window.location.pathname === "/datasets";
  });
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [user, setUser] = useState(getUser);
  const [org, setOrg] = useState(getOrg);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      setShowDashboard(path === "/dashboard");
      setShowSettings(path === "/settings");
      setShowCustomDashboards(path === "/custom-dashboards");
      setShowPlayground(path === "/playground");
      setShowDocs(path === "/docs");
      setShowTracing(path === "/tracing");
      setShowEvaluations(path === "/evaluations");
      setShowDatasets(path === "/datasets");
    };
    window.addEventListener("popstate", handlePopState);
    
    // Check initial path
    const path = window.location.pathname;
    if (path === "/settings") setShowSettings(true);
    if (path === "/custom-dashboards") setShowCustomDashboards(true);
    if (path === "/playground") setShowPlayground(true);
    if (path === "/docs") setShowDocs(true);
    if (path === "/tracing") setShowTracing(true);
    if (path === "/evaluations") setShowEvaluations(true);
    if (path === "/datasets") setShowDatasets(true);
    
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    // Check for OAuth callback token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
      // Store token and redirect to dashboard
      localStorage.setItem("tracevox_token", token);
      setAuthenticated(true);
      window.history.replaceState({}, "", "/dashboard");
      setShowDashboard(true);
      setShowOnboarding(true);
      return;
    }

    if (authenticated && window.location.pathname === "/dashboard") {
      setShowDashboard(true);
      const hasSeenOnboarding = localStorage.getItem("tracevox_onboarding_complete");
      if (!hasSeenOnboarding) {
        setShowOnboarding(true);
      }
    }
  }, [authenticated]);

  const handleAuthSuccess = () => {
    setAuthenticated(true);
    window.history.pushState({}, "", "/dashboard");
    setShowDashboard(true);
    setShowOnboarding(true);
  };

  const handleLogout = () => {
    clearAuth();
    setAuthenticated(false);
    setShowDashboard(false);
    window.history.pushState({}, "", "/");
  };

  // Navigation helpers
  const goToSettings = () => {
    setShowDashboard(false);
    setShowCustomDashboards(false);
    setShowSettings(true);
    window.history.pushState({}, "", "/settings");
  };

  const goToCustomDashboards = () => {
    setShowDashboard(false);
    setShowSettings(false);
    setShowPlayground(false);
    setShowCustomDashboards(true);
    window.history.pushState({}, "", "/custom-dashboards");
  };

  const goToPlayground = () => {
    setShowDashboard(false);
    setShowSettings(false);
    setShowCustomDashboards(false);
    setShowDocs(false);
    setShowPlayground(true);
    window.history.pushState({}, "", "/playground");
  };

  const goToDocs = () => {
    setShowDashboard(false);
    setShowSettings(false);
    setShowCustomDashboards(false);
    setShowPlayground(false);
    setShowTracing(false);
    setShowEvaluations(false);
    setShowDatasets(false);
    setShowDocs(true);
    window.history.pushState({}, "", "/docs");
  };

  const goToTracing = () => {
    setShowDashboard(false);
    setShowSettings(false);
    setShowCustomDashboards(false);
    setShowPlayground(false);
    setShowDocs(false);
    setShowEvaluations(false);
    setShowDatasets(false);
    setShowTracing(true);
    window.history.pushState({}, "", "/tracing");
  };

  const goToEvaluations = () => {
    setShowSettings(false);
    setShowCustomDashboards(false);
    setShowPlayground(false);
    setShowDocs(false);
    setShowTracing(false);
    setShowEvaluations(true);
    setShowDatasets(false);
    window.history.pushState({}, "", "/evaluations");
  };

  const goToDatasets = () => {
    setShowSettings(false);
    setShowCustomDashboards(false);
    setShowPlayground(false);
    setShowDocs(false);
    setShowTracing(false);
    setShowEvaluations(false);
    setShowDatasets(true);
    window.history.pushState({}, "", "/datasets");
  };

  const goToDashboard = () => {
    setShowSettings(false);
    setShowCustomDashboards(false);
    setShowPlayground(false);
    setShowDocs(false);
    setShowTracing(false);
    setShowEvaluations(false);
    setShowDatasets(false);
    setShowDashboard(true);
    window.history.pushState({}, "", "/dashboard");
  };

  // Documentation Page (publicly accessible)
  if (showDocs) {
    return (
      <DocsPage onBack={() => {
        if (authenticated) {
          goToDashboard();
        } else {
          setShowDocs(false);
          window.history.pushState({}, "", "/");
        }
      }} />
    );
  }

  // Settings Page
  if (showSettings && authenticated) {
    return (
      <SettingsPage
        user={user}
        org={org}
        onBack={goToDashboard}
        onApiKeys={() => setShowApiKeys(true)}
      />
    );
  }

  // Custom Dashboards Page
  if (showCustomDashboards && authenticated) {
    return (
      <CustomDashboardBuilder onBack={goToDashboard} />
    );
  }

  // Playground Page
  if (showPlayground && authenticated) {
    return (
      <Playground onBack={goToDashboard} />
    );
  }

  // Tracing Page
  if (showTracing && authenticated) {
    return (
      <TracingPage onBack={goToDashboard} />
    );
  }

  // Evaluations Page
  if (showEvaluations && authenticated) {
    return (
      <EvaluationsPage onBack={goToDashboard} />
    );
  }

  // Datasets Page
  if (showDatasets && authenticated) {
    return (
      <DatasetsPage onBack={goToDashboard} />
    );
  }

  // Main Dashboard
  if (showDashboard && authenticated) {
  return (
      <>
        <Dashboard 
          onLogout={handleLogout}
          onOpenSettings={goToSettings}
          onOpenCustomDashboards={goToCustomDashboards}
          onOpenPlayground={goToPlayground}
          onOpenTracing={goToTracing}
          onOpenEvaluations={goToEvaluations}
          onOpenDatasets={goToDatasets}
        />
        <OnboardingModal
          isOpen={showOnboarding}
          onClose={() => setShowOnboarding(false)}
        />
        <ApiKeysModal
          isOpen={showApiKeys}
          onClose={() => setShowApiKeys(false)}
        />
      </>
    );
  }

  return (
    <>
      <LandingPage onEnterDashboard={handleAuthSuccess} onOpenDocs={goToDocs} />
    </>
  );
}
