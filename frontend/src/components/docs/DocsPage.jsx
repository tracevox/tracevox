/**
 * Tracevox Documentation Page
 * 
 * Comprehensive documentation for the Tracevox LLM Observability Platform.
 * Inspired by Helicone's documentation structure.
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getHealth } from '../../lib/api';
import {
  Book, Code, Zap, Shield, BarChart3, Key, Rocket, 
  Terminal, Copy, Check, ChevronRight, ChevronDown,
  Search, Moon, Sun, ArrowLeft, ExternalLink, Sparkles,
  Activity, DollarSign, Clock, AlertTriangle, Users,
  Settings, Database, Webhook, FileText, Play, TestTube,
  GitBranch, Download, Lock, Globe, Cpu, MessageSquare
} from 'lucide-react';

// Code block with copy functionality
function CodeBlock({ language, code, title }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="rounded-lg overflow-hidden border border-border/50 my-4">
      {title && (
        <div className="bg-muted/50 px-4 py-2 text-xs font-medium flex items-center justify-between border-b border-border/50">
          <span>{title}</span>
          <span className="text-muted-foreground">{language}</span>
        </div>
      )}
      <div className="relative">
        <pre className="bg-zinc-950 p-4 overflow-x-auto">
          <code className="text-sm font-mono text-zinc-100">{code}</code>
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 p-2 rounded-md bg-zinc-800 hover:bg-zinc-700 transition-colors"
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-400" />
          ) : (
            <Copy className="h-4 w-4 text-zinc-400" />
          )}
        </button>
      </div>
    </div>
  );
}

// Tab component for code examples
function CodeTabs({ tabs }) {
  const [activeTab, setActiveTab] = useState(0);
  
  return (
    <div className="rounded-lg overflow-hidden border border-border/50 my-4">
      <div className="bg-muted/50 px-2 py-1 flex gap-1 border-b border-border/50">
        {tabs.map((tab, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              activeTab === i 
                ? 'bg-background text-foreground' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <pre className="bg-zinc-950 p-4 overflow-x-auto">
          <code className="text-sm font-mono text-zinc-100">{tabs[activeTab].code}</code>
        </pre>
        <button
          onClick={() => {
            navigator.clipboard.writeText(tabs[activeTab].code);
          }}
          className="absolute top-2 right-2 p-2 rounded-md bg-zinc-800 hover:bg-zinc-700 transition-colors"
        >
          <Copy className="h-4 w-4 text-zinc-400" />
        </button>
      </div>
    </div>
  );
}

// Callout/Alert component
function Callout({ type = 'info', title, children }) {
  const styles = {
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400',
    warning: 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',
    success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
    tip: 'bg-violet-500/10 border-violet-500/30 text-violet-600 dark:text-violet-400',
  };
  
  return (
    <div className={`rounded-lg border p-4 my-4 ${styles[type]}`}>
      {title && <div className="font-semibold mb-1">{title}</div>}
      <div className="text-sm text-foreground/80">{children}</div>
    </div>
  );
}

// Navigation item
function NavItem({ icon: Icon, label, active, onClick, children, expanded }) {
  const [isExpanded, setIsExpanded] = useState(expanded || false);
  const hasChildren = children && children.length > 0;
  
  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren) setIsExpanded(!isExpanded);
          onClick?.();
        }}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
          active 
            ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium' 
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        }`}
      >
        {Icon && <Icon className="h-4 w-4" />}
        <span className="flex-1 text-left">{label}</span>
        {hasChildren && (
          <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        )}
      </button>
      {hasChildren && isExpanded && (
        <div className="ml-6 mt-1 space-y-1">
          {children.map((child, i) => (
            <button
              key={i}
              onClick={child.onClick}
              className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                child.active 
                  ? 'text-violet-600 dark:text-violet-400 font-medium' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {child.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Main Documentation Page
function ComingSoonSection({ title }) {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">{title}</h1>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-6 text-amber-700 dark:text-amber-400">
        <p className="font-medium">Under development</p>
        <p className="text-sm mt-2 text-muted-foreground">
          This feature is currently in development and will be available in a future release. Stay tuned!
        </p>
      </div>
    </div>
  );
}

export function DocsPage({ onBack }) {
  const [activeSection, setActiveSection] = useState('quickstart');
  const [searchQuery, setSearchQuery] = useState('');
  const [showEnterpriseFeatures, setShowEnterpriseFeatures] = useState(true);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('tracevox_theme') || 'dark';
  });

  useEffect(() => {
    getHealth().then((h) => setShowEnterpriseFeatures(h.show_enterprise_features !== false)).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const navigation = [
    {
      id: 'getting-started',
      label: 'Getting Started',
      icon: Rocket,
      children: [
        { id: 'quickstart', label: 'Quickstart' },
        { id: 'platform-overview', label: 'Platform Overview' },
        { id: 'api-keys', label: 'API Keys' },
      ]
    },
    {
      id: 'gateway',
      label: 'AI Gateway',
      icon: Globe,
      children: [
        { id: 'gateway-overview', label: 'Overview' },
        { id: 'provider-routing', label: 'Provider Routing' },
        { id: 'caching', label: 'Response Caching' },
        { id: 'rate-limits', label: 'Rate Limits' },
        { id: 'llm-security', label: 'LLM Security' },
      ]
    },
    {
      id: 'observability',
      label: 'Observability',
      icon: Activity,
      children: [
        { id: 'request-logging', label: 'Request Logging' },
        { id: 'custom-properties', label: 'Custom Properties' },
        { id: 'cost-tracking', label: 'Cost Tracking' },
        { id: 'latency-monitoring', label: 'Latency Monitoring' },
        { id: 'error-tracking', label: 'Error Tracking' },
      ]
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: BarChart3,
      children: [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'custom-dashboards', label: 'Custom Dashboards' },
        { id: 'reports', label: 'Reports' },
        { id: 'alerts', label: 'Alerts' },
      ]
    },
    {
      id: 'ai-features',
      label: 'AI Features',
      icon: Sparkles,
      children: [
        { id: 'ai-triage', label: 'AI Triage' },
        { id: 'prompt-playground', label: 'Prompt Playground' },
        { id: 'prompt-templates', label: 'Prompt Templates' },
        { id: 'ab-experiments', label: 'A/B Experiments' },
      ]
    },
    {
      id: 'quality',
      label: 'Quality & Safety',
      icon: Shield,
      children: [
        { id: 'hallucination-detection', label: 'Hallucination Detection' },
        { id: 'safe-mode', label: 'SAFE Mode' },
        { id: 'abuse-detection', label: 'Abuse Detection' },
        { id: 'pii-redaction', label: 'PII Redaction' },
      ]
    },
    {
      id: 'integrations',
      label: 'Integrations',
      icon: Code,
      children: [
        { id: 'openai-sdk', label: 'OpenAI SDK' },
        { id: 'anthropic-sdk', label: 'Anthropic SDK' },
        { id: 'google-sdk', label: 'Google AI SDK' },
        { id: 'langchain', label: 'LangChain' },
        { id: 'webhooks', label: 'Webhooks' },
      ]
    },
    {
      id: 'enterprise',
      label: 'Enterprise',
      icon: Users,
      children: [
        { id: 'team-management', label: 'Team Management' },
        { id: 'sso', label: 'SSO Integration' },
        { id: 'billing', label: 'Billing' },
        { id: 'data-export', label: 'Data Export' },
      ]
    },
    {
      id: 'api-reference',
      label: 'API Reference',
      icon: FileText,
      children: [
        { id: 'rest-api', label: 'REST API' },
        { id: 'authentication', label: 'Authentication' },
        { id: 'errors', label: 'Error Handling' },
      ]
    },
  ];

  // Content sections
  const renderContent = () => {
    switch (activeSection) {
      case 'quickstart':
        return <QuickstartSection />;
      case 'platform-overview':
        return <PlatformOverviewSection />;
      case 'api-keys':
        return <ApiKeysSection />;
      case 'gateway-overview':
        return <GatewayOverviewSection />;
      case 'provider-routing':
        return <ProviderRoutingSection />;
      case 'caching':
        return <CachingSection />;
      case 'rate-limits':
        return <RateLimitsSection />;
      case 'llm-security':
        return <LLMSecuritySection />;
      case 'request-logging':
        return <RequestLoggingSection />;
      case 'custom-properties':
        return <CustomPropertiesSection />;
      case 'cost-tracking':
        return <CostTrackingSection />;
      case 'latency-monitoring':
        return <LatencyMonitoringSection />;
      case 'error-tracking':
        return <ErrorTrackingSection />;
      case 'dashboard':
        return <DashboardSection />;
      case 'custom-dashboards':
        return <CustomDashboardsSection />;
      case 'alerts':
        return <AlertsSection />;
      case 'ai-triage':
        return <AITriageSection />;
      case 'prompt-playground':
        return <PromptPlaygroundSection />;
      case 'prompt-templates':
        return <PromptTemplatesSection />;
      case 'ab-experiments':
        return <ABExperimentsSection />;
      case 'hallucination-detection':
        return <HallucinationDetectionSection />;
      case 'safe-mode':
        return <SafeModeSection />;
      case 'openai-sdk':
        return <OpenAISDKSection />;
      case 'anthropic-sdk':
        return <AnthropicSDKSection />;
      case 'google-sdk':
        return <GoogleSDKSection />;
      case 'webhooks':
        return <WebhooksSection />;
      case 'team-management':
        return !showEnterpriseFeatures ? <ComingSoonSection title="Team Management" /> : <TeamManagementSection />;
      case 'sso':
        return !showEnterpriseFeatures ? <ComingSoonSection title="SSO Integration" /> : <SSOSection />;
      case 'rest-api':
        return <RestAPISection />;
      case 'authentication':
        return <AuthenticationSection />;
      default:
        return <QuickstartSection />;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-violet-500" />
              <span className="text-xl font-bold">Tracevox</span>
              <span className="text-sm text-muted-foreground">Docs</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search docs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 w-64 rounded-lg border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                ⌘K
              </kbd>
            </div>
            
            {/* Links */}
            <a 
              href="https://github.com/tracevox" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </a>
            
            {/* Theme Toggle */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg hover:bg-muted"
            >
              {theme === 'dark' ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </button>
            
            <a
              href="/dashboard"
              className="px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg text-sm font-medium"
            >
              Dashboard
            </a>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar Navigation */}
        <aside className="w-72 border-r sticky top-16 h-[calc(100vh-64px)] overflow-y-auto p-4">
          <nav className="space-y-1">
            {navigation.map((section) => (
              <NavItem
                key={section.id}
                icon={section.icon}
                label={section.label}
                expanded={section.children?.some(c => c.id === activeSection)}
                children={section.children?.map(child => ({
                  ...child,
                  active: activeSection === child.id,
                  onClick: () => setActiveSection(child.id),
                }))}
              />
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 max-w-4xl mx-auto px-8 py-8">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </main>

        {/* Table of Contents */}
        <aside className="w-64 border-l sticky top-16 h-[calc(100vh-64px)] overflow-y-auto p-4 hidden xl:block">
          <div className="text-sm font-medium mb-4">On this page</div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <a href="#" className="block hover:text-foreground">Overview</a>
            <a href="#" className="block hover:text-foreground">Installation</a>
            <a href="#" className="block hover:text-foreground">Usage</a>
            <a href="#" className="block hover:text-foreground">Examples</a>
          </div>
        </aside>
      </div>
    </div>
  );
}

// =============================================================================
// CONTENT SECTIONS
// =============================================================================

function QuickstartSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Quickstart</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Get your first LLM request logged with Tracevox in under 2 minutes using our AI Gateway.
      </p>

      <Callout type="tip" title="Why Tracevox?">
        Tracevox provides enterprise-grade LLM observability with automatic logging, cost tracking, 
        quality monitoring, and AI-powered incident triage. Compatible with OpenAI, Anthropic, Google, and 100+ models.
      </Callout>

      <h2 className="text-2xl font-bold mt-8 mb-4 flex items-center gap-2">
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-violet-500 text-white text-sm">1</span>
        Set up your account
      </h2>
      <ol className="list-decimal list-inside space-y-2 text-muted-foreground ml-10">
        <li>Sign up for free at <a href="https://www.tracevox.ai" className="text-violet-500 hover:underline">tracevox.ai</a></li>
        <li>Complete the onboarding flow</li>
        <li>Generate your API key in Settings → API Keys</li>
      </ol>

      <h2 className="text-2xl font-bold mt-8 mb-4 flex items-center gap-2">
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-violet-500 text-white text-sm">2</span>
        Send your first request
      </h2>
      <p className="text-muted-foreground mb-4">
        Tracevox's AI Gateway is OpenAI-compatible, giving you access to 100+ models with automatic logging and observability.
      </p>

      <CodeTabs tabs={[
        {
          label: 'Python',
          code: `from openai import OpenAI

client = OpenAI(
    base_url="https://api.tracevox.ai/v1",
    api_key="tvx_your_api_key"  # Your Tracevox API key
)

# Configure your LLM provider key in headers
response = client.chat.completions.create(
    model="gpt-4o-mini",  # Or any supported model
    messages=[
        {"role": "user", "content": "Hello, world!"}
    ],
    extra_headers={
        "X-LLM-Api-Key": "sk-your-openai-key"  # Your provider's API key
    }
)

print(response.choices[0].message.content)`
        },
        {
          label: 'TypeScript',
          code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.tracevox.ai/v1",
  apiKey: "tvx_your_api_key",  // Your Tracevox API key
});

const response = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello, world!" }],
}, {
  headers: {
    "X-LLM-Api-Key": "sk-your-openai-key"  // Your provider's API key
  }
});

console.log(response.choices[0].message.content);`
        },
        {
          label: 'cURL',
          code: `curl https://api.tracevox.ai/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer tvx_your_api_key" \\
  -H "X-LLM-Api-Key: sk-your-openai-key" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "user", "content": "Hello, world!" }
    ]
  }'`
        }
      ]} />

      <Callout type="success">
        Once you run this code, you'll see your request appear in the Dashboard within seconds, 
        complete with latency, tokens, cost, and quality metrics.
      </Callout>

      <h2 className="text-2xl font-bold mt-8 mb-4 flex items-center gap-2">
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-violet-500 text-white text-sm">3</span>
        Configure LLM credentials (Recommended)
      </h2>
      <p className="text-muted-foreground mb-4">
        For a cleaner integration, store your LLM provider credentials securely in Tracevox:
      </p>
      <ol className="list-decimal list-inside space-y-2 text-muted-foreground ml-4">
        <li>Go to <strong>Settings → LLM Configuration</strong></li>
        <li>Select your provider (OpenAI, Anthropic, or Google)</li>
        <li>Enter your API key (stored securely with enterprise-grade encryption)</li>
        <li>Now you can omit the <code className="bg-muted px-1 rounded">X-LLM-Api-Key</code> header</li>
      </ol>

      <CodeBlock 
        language="python"
        title="Simplified usage with stored credentials"
        code={`# No need to pass provider API key - it's stored securely in Tracevox
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello!"}]
)`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">What's Next?</h2>
      <div className="grid grid-cols-2 gap-4">
        <a href="#" className="p-4 border rounded-lg hover:border-violet-500 transition-colors">
          <h3 className="font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-violet-500" />
            Explore the Dashboard
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            View real-time metrics, costs, and performance data.
          </p>
        </a>
        <a href="#" className="p-4 border rounded-lg hover:border-violet-500 transition-colors">
          <h3 className="font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            Try AI Triage
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Get AI-powered analysis of your LLM performance.
          </p>
        </a>
        <a href="#" className="p-4 border rounded-lg hover:border-violet-500 transition-colors">
          <h3 className="font-semibold flex items-center gap-2">
            <Play className="h-4 w-4 text-violet-500" />
            Prompt Playground
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Test and iterate on prompts in our interactive playground.
          </p>
        </a>
        <a href="#" className="p-4 border rounded-lg hover:border-violet-500 transition-colors">
          <h3 className="font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-violet-500" />
            Quality & Safety
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor hallucination risk and enable SAFE mode.
          </p>
        </a>
      </div>
    </div>
  );
}

function PlatformOverviewSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Platform Overview</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Tracevox is an enterprise-grade LLM observability platform that helps you monitor, analyze, 
        and optimize your AI applications.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Core Features</h2>
      
      <div className="grid gap-6">
        <div className="p-6 border rounded-lg">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-2">
            <Globe className="h-5 w-5 text-violet-500" />
            AI Gateway
          </h3>
          <p className="text-muted-foreground">
            OpenAI-compatible proxy that routes requests to 100+ LLM models while automatically 
            logging every interaction. Supports OpenAI, Anthropic, Google, Azure, and more.
          </p>
        </div>

        <div className="p-6 border rounded-lg">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-2">
            <Activity className="h-5 w-5 text-violet-500" />
            Real-time Observability
          </h3>
          <p className="text-muted-foreground">
            Track every request with comprehensive metrics: latency, token usage, costs, error rates, 
            and custom properties. All data available in real-time.
          </p>
        </div>

        <div className="p-6 border rounded-lg">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-2">
            <DollarSign className="h-5 w-5 text-violet-500" />
            Cost Intelligence
          </h3>
          <p className="text-muted-foreground">
            Automatic cost calculation for all providers and models. Set budgets, receive alerts, 
            and optimize spending with detailed breakdowns by model, user, and feature.
          </p>
        </div>

        <div className="p-6 border rounded-lg">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-2">
            <Shield className="h-5 w-5 text-violet-500" />
            Quality & Safety
          </h3>
          <p className="text-muted-foreground">
            Monitor response quality, detect hallucinations, identify abuse attempts, and 
            enable SAFE mode for PII redaction and content filtering.
          </p>
        </div>

        <div className="p-6 border rounded-lg">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            AI-Powered Insights
          </h3>
          <p className="text-muted-foreground">
            AI Triage analyzes your deployment health and provides actionable recommendations. 
            Prompt Playground lets you test and optimize prompts with real-time feedback.
          </p>
        </div>

        <div className="p-6 border rounded-lg">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-2">
            <Users className="h-5 w-5 text-violet-500" />
            Enterprise Ready
          </h3>
          <p className="text-muted-foreground">
            Team management, role-based access control, SSO integration, custom dashboards, 
            webhook alerts, and data export for compliance.
          </p>
        </div>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4">Architecture</h2>
      <div className="p-6 bg-muted/30 rounded-lg">
        <pre className="text-sm">
{`┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Your App      │────▶│  Tracevox Gateway │────▶│  LLM Provider   │
│                 │     │                  │     │  (OpenAI, etc)  │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   Tracevox Platform    │
                    │  • Request Logging     │
                    │  • Cost Tracking       │
                    │  • Quality Analysis    │
                    │  • Real-time Dashboard │
                    │  • AI Insights         │
                    └────────────────────────┘`}
        </pre>
      </div>
    </div>
  );
}

function ApiKeysSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">API Keys</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Manage your Tracevox API keys for authentication and access control.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Creating API Keys</h2>
      <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
        <li>Navigate to <strong>Settings → API Keys</strong> in your dashboard</li>
        <li>Click <strong>"Create New Key"</strong></li>
        <li>Give your key a descriptive name (e.g., "Production", "Development")</li>
        <li>Copy and securely store your key - it won't be shown again</li>
      </ol>

      <Callout type="warning" title="Security">
        Never expose your API keys in client-side code or public repositories. 
        Use environment variables and server-side calls.
      </Callout>

      <h2 className="text-2xl font-bold mt-8 mb-4">Key Format</h2>
      <p className="text-muted-foreground mb-4">
        Tracevox API keys follow this format:
      </p>
      <CodeBlock 
        language="text"
        code={`tvx_live_CnX_VzEGWQSdgY_N26RuajlOu5l2...  # Live/Production key
tvx_test_abc123...                            # Test key`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Using API Keys</h2>
      <p className="text-muted-foreground mb-4">
        Include your API key in the <code className="bg-muted px-1 rounded">Authorization</code> header:
      </p>
      <CodeBlock 
        language="bash"
        code={`curl https://api.tracevox.ai/v1/chat/completions \\
  -H "Authorization: Bearer tvx_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "gpt-4o-mini", "messages": [...]}'`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Key Management</h2>
      <ul className="space-y-2 text-muted-foreground">
        <li><strong>Rotate keys:</strong> Generate new keys periodically for security</li>
        <li><strong>Revoke keys:</strong> Immediately disable compromised keys</li>
        <li><strong>Usage tracking:</strong> Monitor which keys are being used</li>
        <li><strong>Rate limits:</strong> Each key inherits your organization's limits</li>
      </ul>
    </div>
  );
}

function GatewayOverviewSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">AI Gateway Overview</h1>
      <p className="text-lg text-muted-foreground mb-8">
        The Tracevox AI Gateway is an OpenAI-compatible proxy that provides unified access to 100+ LLM models 
        with automatic observability, caching, and security features.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Supported Providers</h2>
      <div className="grid grid-cols-3 gap-4">
        {[
          { name: 'OpenAI', models: 'GPT-4o, GPT-4 Turbo, GPT-3.5' },
          { name: 'Anthropic', models: 'Claude 3 Opus, Sonnet, Haiku' },
          { name: 'Google', models: 'Gemini 2.0, Gemini 1.5 Pro' },
          { name: 'Azure OpenAI', models: 'All Azure-hosted models' },
          { name: 'Cohere', models: 'Command, Command-R+' },
          { name: 'Mistral', models: 'Mistral Large, Medium, Small' },
        ].map((provider, i) => (
          <div key={i} className="p-4 border rounded-lg">
            <div className="font-semibold">{provider.name}</div>
            <div className="text-sm text-muted-foreground">{provider.models}</div>
          </div>
        ))}
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4">Gateway Endpoints</h2>
      <CodeBlock 
        language="text"
        code={`Base URL: https://api.tracevox.ai/v1

Endpoints:
  POST /chat/completions    # Chat completions (OpenAI-compatible)
  POST /completions         # Text completions
  POST /embeddings          # Text embeddings`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Features</h2>
      <ul className="space-y-3">
        <li className="flex items-start gap-3">
          <Check className="h-5 w-5 text-emerald-500 mt-0.5" />
          <div>
            <strong>Automatic Logging</strong>
            <p className="text-sm text-muted-foreground">Every request is logged with full observability data</p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <Check className="h-5 w-5 text-emerald-500 mt-0.5" />
          <div>
            <strong>Cost Tracking</strong>
            <p className="text-sm text-muted-foreground">Real-time cost calculation for all providers</p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <Check className="h-5 w-5 text-emerald-500 mt-0.5" />
          <div>
            <strong>Response Caching</strong>
            <p className="text-sm text-muted-foreground">Cache identical requests to reduce costs</p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <Check className="h-5 w-5 text-emerald-500 mt-0.5" />
          <div>
            <strong>Rate Limiting</strong>
            <p className="text-sm text-muted-foreground">Configurable rate limits per key or organization</p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <Check className="h-5 w-5 text-emerald-500 mt-0.5" />
          <div>
            <strong>Provider Fallback</strong>
            <p className="text-sm text-muted-foreground">Automatic failover if a provider is down</p>
          </div>
        </li>
      </ul>
    </div>
  );
}

function ProviderRoutingSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Provider Routing</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Route requests to different LLM providers based on model name, with automatic format translation.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Model-Based Routing</h2>
      <p className="text-muted-foreground mb-4">
        The gateway automatically detects the provider based on the model name:
      </p>
      <CodeBlock 
        language="python"
        code={`# Routes to OpenAI
client.chat.completions.create(model="gpt-4o-mini", ...)

# Routes to Anthropic
client.chat.completions.create(model="claude-3-opus-20240229", ...)

# Routes to Google
client.chat.completions.create(model="gemini-2.0-flash-exp", ...)`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Request Translation</h2>
      <p className="text-muted-foreground mb-4">
        Send requests in OpenAI format - Tracevox automatically translates to the target provider's format:
      </p>
      <CodeBlock 
        language="python"
        title="Same code works for all providers"
        code={`# This OpenAI-format request works for Gemini too!
response = client.chat.completions.create(
    model="gemini-2.0-flash-exp",  # Google model
    messages=[
        {"role": "system", "content": "You are helpful."},
        {"role": "user", "content": "Hello!"}
    ],
    temperature=0.7,
    max_tokens=1000
)`}
      />
    </div>
  );
}

function CachingSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Response Caching</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Cache identical requests to reduce costs and latency.
      </p>

      <Callout type="tip">
        Caching works best for requests with <code>temperature=0</code> where responses are deterministic.
      </Callout>

      <h2 className="text-2xl font-bold mt-8 mb-4">Enable Caching</h2>
      <CodeBlock 
        language="python"
        code={`response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "What is 2+2?"}],
    temperature=0,  # Deterministic for caching
    extra_headers={
        "X-Tracevox-Cache": "true",
        "X-Tracevox-Cache-TTL": "3600"  # 1 hour
    }
)`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Cache Headers</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Header</th>
              <th className="text-left py-2">Description</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-2 font-mono text-xs">X-Tracevox-Cache</td>
              <td className="py-2 text-muted-foreground">Enable caching ("true"/"false")</td>
            </tr>
            <tr className="border-b">
              <td className="py-2 font-mono text-xs">X-Tracevox-Cache-TTL</td>
              <td className="py-2 text-muted-foreground">Cache duration in seconds</td>
            </tr>
            <tr className="border-b">
              <td className="py-2 font-mono text-xs">X-Tracevox-Cache-Hit</td>
              <td className="py-2 text-muted-foreground">Response header indicating cache hit</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RateLimitsSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Rate Limits</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Configure rate limits to control API usage and costs.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Default Limits by Tier</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Tier</th>
              <th className="text-left py-2">Requests/min</th>
              <th className="text-left py-2">Requests/day</th>
              <th className="text-left py-2">Tokens/min</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-2">Free</td>
              <td className="py-2 text-muted-foreground">60</td>
              <td className="py-2 text-muted-foreground">1,000</td>
              <td className="py-2 text-muted-foreground">40,000</td>
            </tr>
            <tr className="border-b">
              <td className="py-2">Developer</td>
              <td className="py-2 text-muted-foreground">300</td>
              <td className="py-2 text-muted-foreground">10,000</td>
              <td className="py-2 text-muted-foreground">150,000</td>
            </tr>
            <tr className="border-b">
              <td className="py-2">Team</td>
              <td className="py-2 text-muted-foreground">1,000</td>
              <td className="py-2 text-muted-foreground">100,000</td>
              <td className="py-2 text-muted-foreground">500,000</td>
            </tr>
            <tr className="border-b">
              <td className="py-2">Enterprise</td>
              <td className="py-2 text-muted-foreground">Custom</td>
              <td className="py-2 text-muted-foreground">Custom</td>
              <td className="py-2 text-muted-foreground">Custom</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4">Rate Limit Headers</h2>
      <p className="text-muted-foreground mb-4">
        Response headers indicate your current rate limit status:
      </p>
      <CodeBlock 
        language="text"
        code={`X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1704067200`}
      />
    </div>
  );
}

function LLMSecuritySection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">LLM Security</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Protect your LLM applications from prompt injection, jailbreaking, and other security threats.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Threat Detection</h2>
      <p className="text-muted-foreground mb-4">
        Tracevox automatically scans requests for:
      </p>
      <ul className="space-y-2 text-muted-foreground">
        <li>• <strong>Prompt Injection:</strong> Attempts to override system instructions</li>
        <li>• <strong>Jailbreaking:</strong> Attempts to bypass safety guardrails</li>
        <li>• <strong>Data Extraction:</strong> Attempts to extract training data</li>
        <li>• <strong>Abuse Patterns:</strong> Automated or malicious usage patterns</li>
      </ul>

      <h2 className="text-2xl font-bold mt-8 mb-4">SAFE Mode</h2>
      <p className="text-muted-foreground mb-4">
        Enable SAFE mode for enhanced security:
      </p>
      <ul className="space-y-2 text-muted-foreground">
        <li>• <strong>PII Redaction:</strong> Automatically redact emails, phone numbers, SSN, credit cards</li>
        <li>• <strong>API Key Redaction:</strong> Remove exposed API keys from prompts</li>
        <li>• <strong>Content Filtering:</strong> Filter potentially harmful content</li>
      </ul>

      <CodeBlock 
        language="python"
        title="Enable SAFE mode in AI Triage"
        code={`# SAFE mode is available in the AI Triage dialog
# Toggle it on to enable PII redaction and content filtering

# When SAFE mode is enabled:
# - Emails are redacted: john@email.com → [EMAIL_REDACTED]
# - Phone numbers: 555-123-4567 → [PHONE_REDACTED]
# - API keys: sk-abc123... → [KEY_REDACTED]`}
      />
    </div>
  );
}

function RequestLoggingSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Request Logging</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Every request through the Tracevox Gateway is automatically logged with comprehensive metadata.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">What's Logged</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 border rounded-lg">
          <h3 className="font-semibold mb-2">Request Data</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Model & provider</li>
            <li>• Input messages</li>
            <li>• Temperature & parameters</li>
            <li>• Custom properties</li>
          </ul>
        </div>
        <div className="p-4 border rounded-lg">
          <h3 className="font-semibold mb-2">Response Data</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Generated content</li>
            <li>• Token counts</li>
            <li>• Latency (TTFB & total)</li>
            <li>• Finish reason</li>
          </ul>
        </div>
        <div className="p-4 border rounded-lg">
          <h3 className="font-semibold mb-2">Cost Data</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Input token cost</li>
            <li>• Output token cost</li>
            <li>• Total cost (USD)</li>
            <li>• Cost per 1K tokens</li>
          </ul>
        </div>
        <div className="p-4 border rounded-lg">
          <h3 className="font-semibold mb-2">Quality Data</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Response quality score</li>
            <li>• Hallucination risk</li>
            <li>• Safety flags</li>
            <li>• Error details</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function CustomPropertiesSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Custom Properties</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Tag requests with custom metadata for filtering, grouping, and analysis.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Adding Custom Properties</h2>
      <CodeBlock 
        language="python"
        code={`response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello!"}],
    extra_headers={
        "X-Tracevox-Property-User-Id": "user_123",
        "X-Tracevox-Property-Feature": "chatbot",
        "X-Tracevox-Property-Environment": "production",
        "X-Tracevox-Property-Version": "2.1.0"
    }
)`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Use Cases</h2>
      <ul className="space-y-3 text-muted-foreground">
        <li><strong>User Attribution:</strong> Track costs per user or team</li>
        <li><strong>Feature Tracking:</strong> Compare usage across features</li>
        <li><strong>A/B Testing:</strong> Tag requests by experiment variant</li>
        <li><strong>Environment:</strong> Separate dev/staging/production</li>
        <li><strong>Version Tracking:</strong> Monitor performance across releases</li>
      </ul>

      <h2 className="text-2xl font-bold mt-8 mb-4">Filtering in Dashboard</h2>
      <p className="text-muted-foreground">
        Custom properties appear in the Dashboard where you can filter, group, and aggregate by any property.
      </p>
    </div>
  );
}

function CostTrackingSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Cost Tracking</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Real-time cost calculation and analysis for all LLM providers.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Automatic Cost Calculation</h2>
      <p className="text-muted-foreground mb-4">
        Tracevox automatically calculates costs based on current provider pricing:
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Model</th>
              <th className="text-left py-2">Input (per 1M)</th>
              <th className="text-left py-2">Output (per 1M)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-2">GPT-4o</td>
              <td className="py-2 text-muted-foreground">$2.50</td>
              <td className="py-2 text-muted-foreground">$10.00</td>
            </tr>
            <tr className="border-b">
              <td className="py-2">GPT-4o-mini</td>
              <td className="py-2 text-muted-foreground">$0.15</td>
              <td className="py-2 text-muted-foreground">$0.60</td>
            </tr>
            <tr className="border-b">
              <td className="py-2">Claude 3 Opus</td>
              <td className="py-2 text-muted-foreground">$15.00</td>
              <td className="py-2 text-muted-foreground">$75.00</td>
            </tr>
            <tr className="border-b">
              <td className="py-2">Gemini 1.5 Pro</td>
              <td className="py-2 text-muted-foreground">$1.25</td>
              <td className="py-2 text-muted-foreground">$5.00</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4">Cost Alerts</h2>
      <p className="text-muted-foreground">
        Set up alerts to get notified when costs exceed thresholds. Configure alerts in 
        Settings → Alerts.
      </p>
    </div>
  );
}

function LatencyMonitoringSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Latency Monitoring</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Track response times and identify performance bottlenecks.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Latency Metrics</h2>
      <ul className="space-y-3 text-muted-foreground">
        <li><strong>TTFB (Time to First Byte):</strong> Time until first token streamed</li>
        <li><strong>Total Latency:</strong> Complete request duration</li>
        <li><strong>P50/P95/P99:</strong> Latency percentiles</li>
        <li><strong>By Model:</strong> Compare latency across models</li>
      </ul>

      <Callout type="tip">
        High latency? Consider using faster models like GPT-4o-mini or Gemini Flash, 
        or enable response caching for repeated queries.
      </Callout>
    </div>
  );
}

function ErrorTrackingSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Error Tracking</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Monitor and debug errors across your LLM applications.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Error Types</h2>
      <ul className="space-y-3 text-muted-foreground">
        <li><strong>Rate Limit Errors:</strong> Provider rate limits exceeded</li>
        <li><strong>Authentication Errors:</strong> Invalid API keys</li>
        <li><strong>Timeout Errors:</strong> Request took too long</li>
        <li><strong>Content Filter:</strong> Response blocked by safety filter</li>
        <li><strong>Model Errors:</strong> Model-specific failures</li>
      </ul>

      <h2 className="text-2xl font-bold mt-8 mb-4">Error Rate Dashboard</h2>
      <p className="text-muted-foreground">
        The dashboard shows error rates over time, grouped by error type, model, and provider.
        Set up alerts to get notified when error rates spike.
      </p>
    </div>
  );
}

function DashboardSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Dashboard</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Your central hub for LLM observability and analytics.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Dashboard Tabs</h2>
      <div className="grid gap-4">
        <div className="p-4 border rounded-lg">
          <h3 className="font-semibold">Overview</h3>
          <p className="text-sm text-muted-foreground">
            High-level metrics: total requests, costs, latency, error rate, and trends.
          </p>
        </div>
        <div className="p-4 border rounded-lg">
          <h3 className="font-semibold">Analytics</h3>
          <p className="text-sm text-muted-foreground">
            Deep-dive into usage patterns, model comparisons, and cost breakdowns.
          </p>
        </div>
        <div className="p-4 border rounded-lg">
          <h3 className="font-semibold">Security</h3>
          <p className="text-sm text-muted-foreground">
            Security threats, blocked requests, and abuse detection metrics.
          </p>
        </div>
        <div className="p-4 border rounded-lg">
          <h3 className="font-semibold">Quality</h3>
          <p className="text-sm text-muted-foreground">
            Response quality scores, hallucination risk, and performance metrics.
          </p>
        </div>
        <div className="p-4 border rounded-lg">
          <h3 className="font-semibold">Requests</h3>
          <p className="text-sm text-muted-foreground">
            Browse and search individual requests with full details.
          </p>
        </div>
      </div>
    </div>
  );
}

function CustomDashboardsSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Custom Dashboards</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Build personalized dashboards with drag-and-drop widgets.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Available Widgets</h2>
      <ul className="space-y-2 text-muted-foreground">
        <li>• Metric Cards (requests, costs, latency, errors)</li>
        <li>• Time Series Charts</li>
        <li>• Pie Charts (model distribution, error breakdown)</li>
        <li>• Tables (top models, recent requests)</li>
        <li>• Alerts & Incidents</li>
      </ul>

      <h2 className="text-2xl font-bold mt-8 mb-4">Templates</h2>
      <p className="text-muted-foreground">
        Start with pre-built templates:
      </p>
      <ul className="space-y-2 text-muted-foreground mt-4">
        <li>• <strong>Executive Summary:</strong> High-level KPIs for leadership</li>
        <li>• <strong>Cost Analysis:</strong> Detailed cost breakdowns</li>
        <li>• <strong>Performance:</strong> Latency and reliability metrics</li>
        <li>• <strong>Security:</strong> Threat detection and abuse metrics</li>
      </ul>
    </div>
  );
}

function AlertsSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Alerts</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Get notified when important metrics cross thresholds.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Alert Types</h2>
      <div className="grid gap-4">
        <div className="p-4 border rounded-lg">
          <h3 className="font-semibold">Cost Alerts</h3>
          <p className="text-sm text-muted-foreground">
            Notify when daily/weekly/monthly costs exceed budget
          </p>
        </div>
        <div className="p-4 border rounded-lg">
          <h3 className="font-semibold">Error Rate Alerts</h3>
          <p className="text-sm text-muted-foreground">
            Notify when error rate exceeds threshold (e.g., &gt;5%)
          </p>
        </div>
        <div className="p-4 border rounded-lg">
          <h3 className="font-semibold">Latency Alerts</h3>
          <p className="text-sm text-muted-foreground">
            Notify when P95 latency exceeds threshold
          </p>
        </div>
        <div className="p-4 border rounded-lg">
          <h3 className="font-semibold">Security Alerts</h3>
          <p className="text-sm text-muted-foreground">
            Notify on detected threats or abuse patterns
          </p>
        </div>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4">Alert Channels</h2>
      <ul className="space-y-2 text-muted-foreground">
        <li>• <strong>Email:</strong> Send to team members or distribution lists</li>
        <li>• <strong>Slack:</strong> Post to channels via webhook</li>
        <li>• <strong>PagerDuty:</strong> Create incidents for on-call</li>
        <li>• <strong>Webhooks:</strong> Send to any HTTP endpoint</li>
      </ul>
    </div>
  );
}

function AITriageSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">AI Triage</h1>
      <p className="text-lg text-muted-foreground mb-8">
        AI-powered analysis of your LLM deployment health and incidents.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Features</h2>
      <ul className="space-y-3 text-muted-foreground">
        <li><strong>Incident Analysis:</strong> Get root cause hypotheses for issues</li>
        <li><strong>Health Scoring:</strong> Real-time health score based on metrics</li>
        <li><strong>Recommendations:</strong> Actionable suggestions to improve performance</li>
        <li><strong>SAFE Mode:</strong> PII redaction and content filtering</li>
      </ul>

      <h2 className="text-2xl font-bold mt-8 mb-4">Using AI Triage</h2>
      <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
        <li>Click "Live Triage" in the dashboard</li>
        <li>Enter your question or select an incident</li>
        <li>Toggle SAFE mode if dealing with sensitive data</li>
        <li>Click "Generate" to get AI analysis</li>
      </ol>

      <Callout type="tip">
        AI Triage uses your configured LLM credentials from Settings, so responses 
        are powered by your own API key.
      </Callout>
    </div>
  );
}

function PromptPlaygroundSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Prompt Playground</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Test and iterate on prompts with real-time feedback and cost tracking.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Features</h2>
      <ul className="space-y-3 text-muted-foreground">
        <li><strong>Multi-model Testing:</strong> Test the same prompt across different models</li>
        <li><strong>Real-time Metrics:</strong> See token usage, latency, and costs instantly</li>
        <li><strong>Conversation Mode:</strong> Build multi-turn conversations</li>
        <li><strong>Save as Template:</strong> Save successful prompts for reuse</li>
        <li><strong>Compare Mode:</strong> Side-by-side comparison across models</li>
      </ul>

      <h2 className="text-2xl font-bold mt-8 mb-4">Accessing the Playground</h2>
      <p className="text-muted-foreground">
        Navigate to <strong>Dashboard → Prompt Playground</strong> from the user menu.
      </p>
    </div>
  );
}

function PromptTemplatesSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Prompt Templates</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Store, version, and manage reusable prompt templates.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Creating Templates</h2>
      <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
        <li>Use the Prompt Playground to craft your prompt</li>
        <li>Click "Save as Template"</li>
        <li>Add a name and description</li>
        <li>Define variables (optional) for dynamic content</li>
      </ol>

      <h2 className="text-2xl font-bold mt-8 mb-4">Variables</h2>
      <CodeBlock 
        language="text"
        title="Template with variables"
        code={`You are a helpful assistant for {{company_name}}.

Answer questions about {{topic}} in a {{tone}} tone.

User question: {{question}}`}
      />
    </div>
  );
}

function ABExperimentsSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">A/B Experiments</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Compare prompt performance with controlled experiments.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Creating an Experiment</h2>
      <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
        <li>Define your control prompt (variant A)</li>
        <li>Create one or more test prompts (variants B, C, ...)</li>
        <li>Set traffic split (e.g., 50/50)</li>
        <li>Define success metrics (latency, cost, quality)</li>
        <li>Run the experiment</li>
      </ol>

      <h2 className="text-2xl font-bold mt-8 mb-4">Metrics Tracked</h2>
      <ul className="space-y-2 text-muted-foreground">
        <li>• Average latency per variant</li>
        <li>• Token usage per variant</li>
        <li>• Cost per variant</li>
        <li>• Error rate per variant</li>
        <li>• Quality scores (if configured)</li>
      </ul>
    </div>
  );
}

function HallucinationDetectionSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Hallucination Detection</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Monitor and detect potential hallucinations in LLM responses.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">How It Works</h2>
      <p className="text-muted-foreground mb-4">
        Tracevox analyzes responses for indicators of hallucination:
      </p>
      <ul className="space-y-2 text-muted-foreground">
        <li>• Confidence inconsistencies</li>
        <li>• Factual contradictions within responses</li>
        <li>• Unusual patterns in generated content</li>
        <li>• Response quality scoring</li>
      </ul>

      <h2 className="text-2xl font-bold mt-8 mb-4">Viewing Hallucination Metrics</h2>
      <p className="text-muted-foreground">
        View hallucination risk scores in the Quality tab and AI Insights panel.
      </p>
    </div>
  );
}

function SafeModeSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">SAFE Mode</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Enhanced security mode with PII redaction and content filtering.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">What SAFE Mode Does</h2>
      <ul className="space-y-3 text-muted-foreground">
        <li><strong>Email Redaction:</strong> john@email.com → [EMAIL_REDACTED]</li>
        <li><strong>Phone Redaction:</strong> 555-123-4567 → [PHONE_REDACTED]</li>
        <li><strong>SSN Redaction:</strong> 123-45-6789 → [SSN_REDACTED]</li>
        <li><strong>Credit Card Redaction:</strong> 4111111111111111 → [CARD_REDACTED]</li>
        <li><strong>API Key Redaction:</strong> sk-abc123... → [KEY_REDACTED]</li>
      </ul>

      <h2 className="text-2xl font-bold mt-8 mb-4">Enabling SAFE Mode</h2>
      <p className="text-muted-foreground">
        Toggle SAFE mode in the AI Triage dialog before generating responses.
      </p>
    </div>
  );
}

function OpenAISDKSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">OpenAI SDK Integration</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Use the official OpenAI SDK with Tracevox.
      </p>

      <CodeTabs tabs={[
        {
          label: 'Python',
          code: `from openai import OpenAI

client = OpenAI(
    base_url="https://api.tracevox.ai/v1",
    api_key="tvx_your_api_key"
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": "You are helpful."},
        {"role": "user", "content": "Hello!"}
    ]
)

print(response.choices[0].message.content)`
        },
        {
          label: 'TypeScript',
          code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.tracevox.ai/v1",
  apiKey: "tvx_your_api_key",
});

const response = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    { role: "system", content: "You are helpful." },
    { role: "user", content: "Hello!" }
  ],
});

console.log(response.choices[0].message.content);`
        }
      ]} />
    </div>
  );
}

function AnthropicSDKSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Anthropic SDK Integration</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Use Anthropic Claude models through Tracevox.
      </p>

      <CodeBlock 
        language="python"
        code={`from openai import OpenAI

# Use OpenAI SDK format - Tracevox translates automatically
client = OpenAI(
    base_url="https://api.tracevox.ai/v1",
    api_key="tvx_your_api_key"
)

response = client.chat.completions.create(
    model="claude-3-opus-20240229",  # Anthropic model
    messages=[
        {"role": "system", "content": "You are Claude."},
        {"role": "user", "content": "Hello!"}
    ],
    max_tokens=1000
)`}
      />
    </div>
  );
}

function GoogleSDKSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Google AI SDK Integration</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Use Google Gemini models through Tracevox.
      </p>

      <CodeBlock 
        language="python"
        code={`from openai import OpenAI

# Use OpenAI SDK format - Tracevox translates automatically
client = OpenAI(
    base_url="https://api.tracevox.ai/v1",
    api_key="tvx_your_api_key"
)

response = client.chat.completions.create(
    model="gemini-2.0-flash-exp",  # Google model
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)`}
      />

      <Callout type="tip">
        Store your Google API key in Settings → LLM Configuration for seamless integration.
      </Callout>
    </div>
  );
}

function WebhooksSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Webhooks</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Send real-time notifications to your systems.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Webhook Events</h2>
      <ul className="space-y-2 text-muted-foreground">
        <li>• <code>alert.triggered</code> - When an alert fires</li>
        <li>• <code>cost.threshold</code> - When costs exceed budget</li>
        <li>• <code>error.spike</code> - When error rate spikes</li>
        <li>• <code>security.threat</code> - When threat detected</li>
      </ul>

      <h2 className="text-2xl font-bold mt-8 mb-4">Webhook Payload</h2>
      <CodeBlock 
        language="json"
        code={`{
  "event": "alert.triggered",
  "timestamp": "2024-01-15T10:30:00Z",
  "alert": {
    "id": "alert_123",
    "name": "High Error Rate",
    "condition": "error_rate > 0.05",
    "current_value": 0.08
  },
  "organization": {
    "id": "org_456",
    "name": "Acme Inc"
  }
}`}
      />
    </div>
  );
}

function TeamManagementSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Team Management</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Invite team members and manage access with role-based permissions.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Roles</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Role</th>
              <th className="text-left py-2">Permissions</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-2 font-semibold">Owner</td>
              <td className="py-2 text-muted-foreground">Full access, billing, delete org</td>
            </tr>
            <tr className="border-b">
              <td className="py-2 font-semibold">Admin</td>
              <td className="py-2 text-muted-foreground">Manage members, settings, API keys</td>
            </tr>
            <tr className="border-b">
              <td className="py-2 font-semibold">Member</td>
              <td className="py-2 text-muted-foreground">View dashboard, use features</td>
            </tr>
            <tr className="border-b">
              <td className="py-2 font-semibold">Viewer</td>
              <td className="py-2 text-muted-foreground">Read-only dashboard access</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4">Inviting Members</h2>
      <p className="text-muted-foreground">
        Navigate to Settings → Team to invite new members via email.
      </p>
    </div>
  );
}

function SSOSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">SSO Integration</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Enterprise single sign-on with SAML and OIDC.
      </p>

      <Callout type="info">
        SSO is available on Enterprise plans. Contact sales@tracevox.ai to enable.
      </Callout>

      <h2 className="text-2xl font-bold mt-8 mb-4">Supported Providers</h2>
      <ul className="space-y-2 text-muted-foreground">
        <li>• Okta</li>
        <li>• Azure AD</li>
        <li>• Google Workspace</li>
        <li>• OneLogin</li>
        <li>• Custom SAML 2.0</li>
        <li>• Custom OIDC</li>
      </ul>
    </div>
  );
}

function RestAPISection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">REST API Reference</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Complete API documentation for programmatic access.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Base URL</h2>
      <CodeBlock language="text" code="https://api.tracevox.ai" />

      <h2 className="text-2xl font-bold mt-8 mb-4">Endpoints</h2>
      <div className="space-y-4">
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-500 text-xs font-mono rounded">POST</span>
            <code className="text-sm">/v1/chat/completions</code>
          </div>
          <p className="text-sm text-muted-foreground mt-2">Chat completions (OpenAI-compatible)</p>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-500 text-xs font-mono rounded">GET</span>
            <code className="text-sm">/api/dashboard/overview</code>
          </div>
          <p className="text-sm text-muted-foreground mt-2">Dashboard overview metrics</p>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-500 text-xs font-mono rounded">GET</span>
            <code className="text-sm">/api/analytics/realtime</code>
          </div>
          <p className="text-sm text-muted-foreground mt-2">Real-time analytics metrics</p>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-500 text-xs font-mono rounded">POST</span>
            <code className="text-sm">/chat</code>
          </div>
          <p className="text-sm text-muted-foreground mt-2">AI Triage endpoint</p>
        </div>
      </div>
    </div>
  );
}

function AuthenticationSection() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Authentication</h1>
      <p className="text-lg text-muted-foreground mb-8">
        How to authenticate with the Tracevox API.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">API Key Authentication</h2>
      <p className="text-muted-foreground mb-4">
        Include your API key in the Authorization header:
      </p>
      <CodeBlock 
        language="bash"
        code={`curl https://api.tracevox.ai/v1/chat/completions \\
  -H "Authorization: Bearer tvx_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '...'`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Session Authentication</h2>
      <p className="text-muted-foreground">
        When using the web dashboard, authentication is handled via session tokens 
        stored in your browser after login.
      </p>
    </div>
  );
}

export default DocsPage;

