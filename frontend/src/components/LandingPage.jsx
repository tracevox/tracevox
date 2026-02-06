import React, { useState, useEffect } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  Code2,
  Cookie,
  DollarSign,
  Eye,
  Gauge,
  GitBranch,
  Github,
  Globe,
  Layers,
  LineChart,
  Lock,
  Menu,
  MessageCircle,
  Play,
  Plus,
  Send,
  Shield,
  Sparkles,
  Star,
  TrendingDown,
  X,
  Zap,
} from "lucide-react";
import { signup, login, getHealth } from "../lib/api";

// GitHub repo URL for open-source landing (update to your actual repo)
const GITHUB_REPO_URL = "https://github.com/tracevox/tracevox";

// Smooth scroll function
const scrollToSection = (e, sectionId) => {
  e.preventDefault();
  const element = document.getElementById(sectionId);
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }
};

// Cookie Consent Banner Component
const CookieConsent = ({ onAccept, onDecline }) => {
  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6"
    >
      <div className="max-w-4xl mx-auto bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
          <Cookie className="w-8 h-8 text-violet-400 shrink-0" />
          <div className="flex-1">
            <h3 className="text-white font-semibold mb-1">We value your privacy</h3>
            <p className="text-white/60 text-sm">
              We use cookies to enhance your browsing experience, analyze site traffic, and personalize content. 
              By clicking "Accept All", you consent to our use of cookies.
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <button
              onClick={onDecline}
              className="px-4 py-2 bg-white/10 text-white border border-white/30 hover:bg-white/20 hover:border-white/50 rounded-lg text-sm font-medium transition-all"
            >
              Decline
            </button>
            <button
              onClick={onAccept}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-all"
            >
              Accept All
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// Live Chat Widget Component
const LiveChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([
    { from: "bot", text: "Hi! 👋 How can we help you today?" }
  ]);

  const sendMessage = () => {
    if (!message.trim()) return;
    setMessages([...messages, { from: "user", text: message }]);
    setMessage("");
    // Simulate bot response
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        from: "bot", 
        text: "Thanks for reaching out! Our team typically responds within a few hours. You can also email us at support@tracevox.ai" 
      }]);
    }, 1000);
  };

  return (
    <>
      {/* Chat Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-gradient-to-r from-violet-600 to-purple-600 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
            >
              <X className="w-6 h-6 text-white" />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
            >
              <MessageCircle className="w-6 h-6 text-white" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 z-40 w-80 md:w-96 bg-[#0d1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-violet-600 to-purple-600 p-4">
              <h3 className="text-white font-semibold">Chat with us</h3>
              <p className="text-white/70 text-sm">We typically reply within a few hours</p>
            </div>

            {/* Messages */}
            <div className="h-64 overflow-y-auto p-4 space-y-3">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                    msg.from === "user" 
                      ? "bg-violet-600 text-white rounded-br-md" 
                      : "bg-white/10 text-white/80 rounded-bl-md"
                  }`}>
                    {msg.text}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/10">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-violet-500"
                />
                <button
                  onClick={sendMessage}
                  className="w-10 h-10 bg-violet-600 hover:bg-violet-500 rounded-xl flex items-center justify-center transition-colors"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// Animated gradient orbs
const GradientOrb = ({ className, delay = 0 }) => (
  <motion.div
    className={`absolute rounded-full blur-3xl opacity-30 ${className}`}
    animate={{
      scale: [1, 1.2, 1],
      opacity: [0.2, 0.4, 0.2],
      x: [0, 30, 0],
      y: [0, -20, 0],
    }}
    transition={{
      duration: 8,
      delay,
      repeat: Infinity,
      ease: "easeInOut",
    }}
  />
);

// Animated code block
const CodeBlock = () => {
  const lines = [
    { text: "from openai import OpenAI", delay: 0 },
    { text: "", delay: 0.1 },
    { text: "# One line to enable observability", delay: 0.2 },
    { text: "client = OpenAI(", delay: 0.3 },
    { text: '    base_url="https://api.tracevox.ai/v1",', delay: 0.4, highlight: true },
    { text: '    default_headers={"X-Tracevox-Key": "sk_live_xxx"}', delay: 0.5, highlight: true },
    { text: ")", delay: 0.6 },
    { text: "", delay: 0.7 },
    { text: "# Use as normal - we handle the rest", delay: 0.8 },
    { text: 'response = client.chat.completions.create(', delay: 0.9 },
    { text: '    model="gpt-4o",', delay: 1.0 },
    { text: '    messages=[{"role": "user", "content": "Hello!"}]', delay: 1.1 },
    { text: ")", delay: 1.2 },
  ];

  return (
    <div className="bg-[#0d1117] rounded-2xl border border-white/10 p-6 font-mono text-sm overflow-hidden">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-3 h-3 rounded-full bg-red-500" />
        <div className="w-3 h-3 rounded-full bg-yellow-500" />
        <div className="w-3 h-3 rounded-full bg-green-500" />
        <span className="ml-2 text-white/40 text-xs">quickstart.py</span>
      </div>
      <div className="space-y-1">
        {lines.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: line.delay + 0.5, duration: 0.3 }}
            className={line.highlight ? "text-emerald-400" : "text-white/70"}
          >
            {line.text || "\u00A0"}
          </motion.div>
        ))}
      </div>
    </div>
  );
};

// Feature card
const FeatureCard = ({ icon: Icon, title, description, gradient }) => (
  <motion.div
    whileHover={{ y: -8, scale: 1.02 }}
    className="relative group"
  >
    <div className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500`} />
    <div className="relative bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10 hover:border-white/20 transition-all duration-300 h-full">
      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-6`}>
        <Icon className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-3">{title}</h3>
      <p className="text-white/60 leading-relaxed">{description}</p>
    </div>
  </motion.div>
);

// Pricing card (underDevelopment = show as "Under development", no CTA)
const PricingCard = ({ name, monthlyPrice, annualPrice, period, description, features, popular, cta, isAnnual, underDevelopment }) => {
  const price = isAnnual ? annualPrice : monthlyPrice;
  const displayPeriod = price === 0 ? "forever" : (isAnnual ? "month, billed annually" : "month");
  
  return (
    <motion.div
      whileHover={underDevelopment ? undefined : { y: -8 }}
      className={`relative rounded-3xl p-8 ${
        underDevelopment
          ? "bg-white/5 border border-white/10 opacity-80"
          : popular
            ? "bg-gradient-to-b from-violet-600/20 to-purple-900/20 border-2 border-violet-500/50"
            : "bg-white/5 border border-white/10"
      }`}
    >
      {underDevelopment && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-white/20 text-white/90 rounded-full text-sm font-medium">
          Under development
        </div>
      )}
      {popular && !underDevelopment && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-violet-600 to-purple-600 rounded-full text-sm font-semibold text-white">
          Most Popular
        </div>
      )}
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-white mb-2">{name}</h3>
        <p className="text-white/50 text-sm">{description}</p>
      </div>
      <div className="mb-6">
        {price === null ? (
          <div className="text-3xl font-bold text-white">Custom</div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-white">${price}</span>
            <span className="text-white/50">/{displayPeriod}</span>
            {isAnnual && monthlyPrice > 0 && (
              <span className="text-emerald-400 text-sm">Save 20%</span>
            )}
          </div>
        )}
      </div>
      <ul className="space-y-3 mb-8">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3 text-white/70">
            <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <button
        disabled={underDevelopment}
        className={`w-full py-3 rounded-xl font-semibold transition-all duration-300 ${
          underDevelopment
            ? "bg-white/5 text-white/50 cursor-not-allowed"
            : popular
              ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-500 hover:to-purple-500"
              : "bg-white/10 text-white hover:bg-white/20"
        }`}
      >
        {underDevelopment ? "Coming soon" : cta}
      </button>
    </motion.div>
  );
};

// FAQ Item
const FAQItem = ({ question, answer, isOpen, onClick }) => (
  <motion.div 
    className="border border-violet-500/40 bg-[#12121f] hover:bg-[#1a1a2e] rounded-lg transition-all shadow-lg"
    initial={false}
  >
    <button
      onClick={onClick}
      className="w-full py-3 px-5 flex items-center justify-between text-left"
    >
      <h3 
        className="text-base font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
        style={{ 
          color: '#ffffff', 
          textShadow: '0 1px 3px rgba(0,0,0,0.5)',
          WebkitTextFillColor: '#ffffff'
        }}
      >
        {question}
      </h3>
      <motion.div
        animate={{ rotate: isOpen ? 45 : 0 }}
        className="text-violet-400 ml-4 shrink-0"
      >
        <Plus className="w-5 h-5" />
      </motion.div>
    </button>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
        >
          <p 
            className="pb-4 px-5 leading-relaxed text-gray-200 text-sm"
            style={{ color: '#e5e5e5' }}
          >
            {answer}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  </motion.div>
);

// Auth Modal Component
const AuthModal = ({ isOpen, onClose, onSuccess, initialMode = "login" }) => {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMode(initialMode);
    setError("");
  }, [initialMode, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (mode === "signup") {
        // Call real signup API
        await signup({ email, password, name, company });
      } else {
        // Call real login API
        await login({ email, password });
      }
      onSuccess();
    } catch (err) {
      setError(err.message || "Authentication failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        
        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md bg-[#1a1a2e] border border-white/10 rounded-2xl p-8 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Logo */}
          <div className="flex items-center justify-center mb-6">
            <img src="/logo-tracevox-full.svg" alt="Tracevox" className="h-14" />
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-white text-center mb-2">
            {mode === "login" ? "Welcome back" : "Start your free trial"}
          </h2>
          <p className="text-white/60 text-center mb-6">
            {mode === "login" 
              ? "Sign in to your account" 
              : "No credit card required • 7-day free trial"}
          </p>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <label className="block text-white/70 text-sm mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-violet-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-white/70 text-sm mb-1.5">Company (optional)</label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Acme Inc."
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-violet-500 transition-colors"
                  />
                </div>
              </>
            )}
            
            <div>
              <label className="block text-white/70 text-sm mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
            
            <div>
              <label className="block text-white/70 text-sm mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            {mode === "login" && (
              <div className="flex justify-end">
                <button type="button" className="text-sm text-violet-400 hover:text-violet-300 transition-colors">
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 rounded-xl font-semibold text-white hover:from-violet-500 hover:to-purple-500 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {mode === "login" ? "Signing in..." : "Creating account..."}
                </>
              ) : (
                mode === "login" ? "Sign in" : "Start free trial"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-white/40 text-sm">or continue with</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Social login */}
          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => window.location.href = `${import.meta.env.VITE_API_BASE_URL || 'https://api.tracevox.ai'}/api/auth/oauth/google`}
              className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span className="text-white text-sm">Google</span>
            </button>
            <button 
              onClick={() => window.location.href = `${import.meta.env.VITE_API_BASE_URL || 'https://api.tracevox.ai'}/api/auth/oauth/github`}
              className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
            >
              <svg className="w-5 h-5" fill="#fff" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span className="text-white text-sm">GitHub</span>
            </button>
          </div>

          {/* Toggle mode */}
          <p className="text-center text-white/60 text-sm mt-6">
            {mode === "login" ? (
              <>
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
                >
                  Sign up free
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// Main Landing Page Component
const LandingPage = ({ onEnterDashboard, onOpenDocs }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFAQ, setOpenFAQ] = useState(null);
  const [isAnnual, setIsAnnual] = useState(false);
  const [showCookieConsent, setShowCookieConsent] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showEnterpriseFeatures, setShowEnterpriseFeatures] = useState(true);

  useEffect(() => {
    getHealth().then((h) => setShowEnterpriseFeatures(h.show_enterprise_features !== false)).catch(() => {});
  }, []);
  const [authMode, setAuthMode] = useState("login");
  const [showVideoModal, setShowVideoModal] = useState(false);
  const { scrollYProgress } = useScroll();
  const headerOpacity = useTransform(scrollYProgress, [0, 0.1], [0, 1]);

  const handleOpenLogin = () => {
    setAuthMode("login");
    setShowAuthModal(true);
  };

  const handleOpenSignup = () => {
    setAuthMode("signup");
    setShowAuthModal(true);
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    onEnterDashboard();
  };

  // Check for cookie consent on mount
  useEffect(() => {
    const consent = localStorage.getItem("cookieConsent");
    if (!consent) {
      // Show cookie banner after a short delay
      const timer = setTimeout(() => setShowCookieConsent(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleCookieAccept = () => {
    localStorage.setItem("cookieConsent", "accepted");
    setShowCookieConsent(false);
  };

  const handleCookieDecline = () => {
    localStorage.setItem("cookieConsent", "declined");
    setShowCookieConsent(false);
  };

  const features = [
    {
      icon: Zap,
      title: "One-Line Integration",
      description: "Change your base URL and you're done. Works with OpenAI, Anthropic, Google, and more.",
      gradient: "from-yellow-500 to-orange-600",
    },
    {
      icon: Eye,
      title: "Real-Time Observability",
      description: "Watch every request, response, and token flow through your system in real-time.",
      gradient: "from-blue-500 to-cyan-600",
    },
    {
      icon: DollarSign,
      title: "Cost Intelligence",
      description: "Track spend by model, user, and feature. Get alerts before budgets blow up.",
      gradient: "from-emerald-500 to-teal-600",
    },
    {
      icon: Gauge,
      title: "Performance Metrics",
      description: "P50, P90, P99 latencies. Token throughput. Error rates. All in one place.",
      gradient: "from-violet-500 to-purple-600",
    },
    {
      icon: Shield,
      title: "SAFE Mode Security",
      description: "Automatic PII redaction, prompt injection detection, and content filtering. Your data stays protected.",
      gradient: "from-red-500 to-pink-600",
    },
    {
      icon: LineChart,
      title: "Datadog Integration",
      description: "Native integration with Datadog. Export metrics, traces, and logs to your existing observability stack.",
      gradient: "from-purple-500 to-violet-600",
    },
    {
      icon: TrendingDown,
      title: "Predictive Alerts",
      description: "ML-powered anomaly detection. Get warned before issues impact users, not after.",
      gradient: "from-orange-500 to-red-600",
    },
    {
      icon: GitBranch,
      title: "Provider Fallback",
      description: "Automatic failover between providers. If OpenAI is slow, switch to Anthropic seamlessly.",
      gradient: "from-cyan-500 to-blue-600",
    },
  ];

  const pricingPlans = [
    {
      name: "Free",
      monthlyPrice: 0,
      annualPrice: 0,
      period: "forever",
      description: "For side projects and experiments",
      features: [
        "10,000 requests/month",
        "7-day data retention",
        "Basic analytics",
        "Community support",
      ],
      cta: "Get Started Free",
    },
    {
      name: "Developer",
      monthlyPrice: 20,
      annualPrice: 16, // 20% off
      period: "month",
      description: "For individual developers and small projects",
      features: [
        "100,000 requests/month",
        "30-day data retention",
        "Full cost tracking",
        "Alerts & notifications",
        "Email support",
      ],
      cta: "Start Free Trial",
    },
    {
      name: "Team",
      monthlyPrice: 100,
      annualPrice: 80, // 20% off
      period: "month",
      description: "For growing teams shipping to production",
      features: [
        "1,000,000 requests/month",
        "90-day data retention",
        "Advanced analytics",
        "Custom dashboards",
        "Priority support",
        "10 team members",
      ],
      popular: true,
      cta: "Start Free Trial",
    },
    {
      name: "Enterprise",
      monthlyPrice: null,
      annualPrice: null,
      period: "month",
      description: "For organizations with advanced needs",
      features: [
        "Unlimited requests",
        "1-year data retention",
        "SSO / SAML",
        "Dedicated support",
        "Custom SLA",
        "On-premise option",
      ],
      cta: "Contact Sales",
    },
  ];

  const faqs = [
    {
      question: "How does the proxy gateway work?",
      answer: "Simply change your API base URL to point to our gateway. We transparently forward requests to your LLM provider while capturing metrics, costs, and performance data. Your API keys are encrypted and never logged.",
    },
    {
      question: "Which LLM providers do you support?",
      answer: "We support all major providers including OpenAI, Anthropic Claude, Google Gemini, Azure OpenAI, Mistral, Cohere, and any OpenAI-compatible API. Adding a new provider takes minutes.",
    },
    {
      question: "Is my data secure?",
      answer: "Absolutely. We're SOC2 Type II compliant. Prompts and responses can be optionally excluded from logging. All data is encrypted in transit and at rest. Enterprise customers can use their own encryption keys.",
    },
    {
      question: "Can I self-host?",
      answer: "Yes! Enterprise customers can deploy our platform on their own infrastructure. We support Kubernetes, Docker, and major cloud providers. Contact sales for details.",
    },
    {
      question: "What's your uptime SLA?",
      answer: "We guarantee 99.9% uptime for Team plans and 99.99% for Enterprise. Our proxy adds less than 10ms of latency. If we're down, your requests automatically bypass our gateway.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#030014] text-white overflow-x-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 pointer-events-none">
        <GradientOrb className="w-[800px] h-[800px] bg-violet-600 -top-[400px] -left-[400px]" delay={0} />
        <GradientOrb className="w-[600px] h-[600px] bg-blue-600 top-[20%] right-[-200px]" delay={2} />
        <GradientOrb className="w-[700px] h-[700px] bg-purple-600 bottom-[-200px] left-[30%]" delay={4} />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-50" />
      </div>

      {/* Floating Header */}
      <motion.header
        style={{ opacity: headerOpacity }}
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-black/50 border-b border-white/5"
      >
        <nav className="w-full px-4 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <img src="/logo-tracevox-full.svg" alt="Tracevox" className="h-14" />
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" onClick={(e) => scrollToSection(e, "features")} className="text-white/70 hover:text-white transition-colors">Features</a>
            <a href="#pricing" onClick={(e) => scrollToSection(e, "pricing")} className="text-white/70 hover:text-white transition-colors">Pricing</a>
            <a href="#faq" onClick={(e) => scrollToSection(e, "faq")} className="text-white/70 hover:text-white transition-colors">FAQ</a>
            <button onClick={onOpenDocs} className="text-white/70 hover:text-white transition-colors">Docs</button>
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-white transition-colors flex items-center gap-1.5">
              <Github className="w-4 h-4" /> GitHub
            </a>
            <a href="/blog" className="text-white/70 hover:text-white transition-colors">Blog</a>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-white bg-white/10 hover:bg-white/20 border border-white/30 hover:border-white/50 rounded-xl font-medium transition-all duration-300 flex items-center gap-2"
            >
              <Github className="w-4 h-4" /> Star
            </a>
            <button 
              onClick={handleOpenLogin}
              className="px-4 py-2 text-white bg-white/10 hover:bg-white/20 border border-white/30 hover:border-white/50 rounded-xl font-medium transition-all duration-300"
            >
              Log in
            </button>
            <button 
              onClick={handleOpenSignup}
              className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 rounded-xl font-semibold hover:from-violet-500 hover:to-purple-500 transition-all duration-300"
            >
              Get Started
            </button>
          </div>
          <button 
            className="md:hidden text-white"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>
        </nav>
      </motion.header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#030014]/95 backdrop-blur-xl md:hidden"
          >
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-0 p-6"
            >
              <div className="flex justify-between items-center mb-12">
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex items-center"
                >
                  <img src="/logo-tracevox-full.svg" alt="Tracevox" className="h-14" />
                </motion.div>
                <motion.button 
                  initial={{ opacity: 0, rotate: -90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  transition={{ delay: 0.1 }}
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
                >
                  <X className="w-6 h-6" />
                </motion.button>
              </div>
              <nav className="space-y-2">
                {[
                  { href: "#features", label: "Features", id: "features" },
                  { href: "#pricing", label: "Pricing", id: "pricing" },
                  { href: "#faq", label: "FAQ", id: "faq" },
                  { href: "/docs", label: "Docs", id: null, onClick: onOpenDocs },
                  { href: GITHUB_REPO_URL, label: "GitHub", id: null, external: true },
                  { href: "/blog", label: "Blog", id: null },
                  { href: "/changelog", label: "Changelog", id: null },
                  { href: "/status", label: "Status", id: null },
                ].map((item, i) => (
                  <motion.a
                    key={item.label}
                    href={item.onClick ? "#" : item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noopener noreferrer" : undefined}
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.05 }}
                    onClick={(e) => {
                      if (item.onClick) {
                        e.preventDefault();
                        item.onClick();
                      } else if (item.id) {
                        scrollToSection(e, item.id);
                      }
                      setMobileMenuOpen(false);
                    }}
                    className="block text-2xl font-medium py-3 px-4 rounded-xl hover:bg-white/5 transition-colors"
                  >
                    {item.label}
                  </motion.a>
                ))}
              </nav>
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mt-12 space-y-4"
              >
                <button 
                  onClick={() => { setMobileMenuOpen(false); handleOpenLogin(); }}
                  className="w-full py-4 bg-white/20 border border-white/30 rounded-xl font-semibold text-white"
                >
                  Log in
                </button>
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-4 bg-white text-black rounded-xl font-semibold flex items-center justify-center gap-2"
                >
                  <Github className="w-5 h-5" /> Star on GitHub
                </a>
                <button 
                  onClick={() => { setMobileMenuOpen(false); handleOpenSignup(); }}
                  className="w-full py-4 bg-gradient-to-r from-violet-600 to-purple-600 rounded-xl font-semibold"
                >
                  Get Started
                </button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 mb-8"
            >
              <Github className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-emerald-200 font-medium">100% Open Source</span>
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300 text-xs font-medium flex items-center gap-1"
              >
                View on GitHub <ChevronRight className="w-3 h-3" />
              </a>
            </motion.div>

            {/* Main Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-5xl md:text-7xl lg:text-8xl font-bold mb-6 leading-tight"
            >
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-white/60">
                Observe Every
              </span>
              <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-purple-400 to-pink-400">
                LLM Request
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-xl md:text-2xl text-white/60 max-w-3xl mx-auto mb-10 leading-relaxed"
            >
              Open source LLM observability. Self-host or use our cloud. Monitor costs, 
              debug issues, and optimize your LLM applications.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 bg-white text-black rounded-2xl font-semibold text-lg hover:bg-white/90 transition-all duration-300 flex items-center gap-2 group"
              >
                <Github className="w-5 h-5" />
                Star on GitHub
                <Star className="w-5 h-5 text-amber-500" />
              </a>
              <button 
                onClick={handleOpenSignup}
                className="px-8 py-4 bg-gradient-to-r from-violet-600 to-purple-600 rounded-2xl font-semibold text-lg hover:from-violet-500 hover:to-purple-500 transition-all duration-300 flex items-center gap-2 group"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button 
                onClick={() => setShowVideoModal(true)}
                className="px-8 py-4 bg-white/5 border border-white/10 rounded-2xl font-semibold text-lg hover:bg-white/10 transition-all duration-300 flex items-center gap-2"
              >
                <Play className="w-5 h-5" />
                Watch Demo
              </button>
            </motion.div>

            {/* Trust Badges */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-white/40 text-sm mt-6"
            >
              Open source • Self-host or cloud • Free tier forever
            </motion.p>

          </div>

          {/* Hero Visual - Code + Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="relative"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-[#030014] via-transparent to-transparent z-10 pointer-events-none" />
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Code Block */}
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-purple-600 rounded-3xl blur-xl opacity-30" />
                <CodeBlock />
              </div>

              {/* Dashboard Preview */}
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-3xl blur-xl opacity-30" />
                <div className="relative bg-[#0d1117] rounded-2xl border border-white/10 p-6 overflow-hidden">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="ml-2 text-white/40 text-xs">Tracevox Dashboard</span>
                  </div>
                  
                  {/* Mock Dashboard Stats */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-white/5 rounded-xl p-4">
                      <div className="text-white/50 text-xs mb-1">Requests Today</div>
                      <div className="text-2xl font-bold text-white">24,892</div>
                      <div className="text-emerald-400 text-xs mt-1">↑ 12.3%</div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4">
                      <div className="text-white/50 text-xs mb-1">Total Cost</div>
                      <div className="text-2xl font-bold text-white">$142.30</div>
                      <div className="text-red-400 text-xs mt-1">↑ 5.2%</div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4">
                      <div className="text-white/50 text-xs mb-1">Avg Latency</div>
                      <div className="text-2xl font-bold text-white">847ms</div>
                      <div className="text-emerald-400 text-xs mt-1">↓ 8.1%</div>
                    </div>
                  </div>

                  {/* Mock Chart */}
                  <div className="h-32 bg-white/5 rounded-xl flex items-end p-4 gap-1">
                    {[40, 65, 45, 80, 55, 70, 90, 60, 75, 85, 50, 95].map((h, i) => (
                      <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${h}%` }}
                        transition={{ delay: 0.8 + i * 0.05, duration: 0.5 }}
                        className="flex-1 bg-gradient-to-t from-violet-600 to-purple-400 rounded-t"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Built for Scale Banner */}
      <section className="py-16 px-6 border-y border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-2xl md:text-3xl font-bold text-white">&lt;10ms</div>
                <div className="text-white/50 text-sm">Added Latency</div>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Layers className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-2xl md:text-3xl font-bold text-white">Enterprise-Ready</div>
                <div className="text-white/50 text-sm">SOC2 Compliant Architecture</div>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
                <Globe className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-2xl md:text-3xl font-bold text-white">Built for Scale</div>
                <div className="text-white/50 text-sm">Handles Billions of Requests</div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-5xl font-bold mb-6"
            >
              Everything You Need to
              <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-purple-400">
                Ship with Confidence
              </span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-xl text-white/60 max-w-2xl mx-auto"
            >
              Open source from day one. Self-host or use our cloud—Tracevox gives you 
              the visibility and control to build reliable AI applications.
            </motion.p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <FeatureCard {...feature} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* AI-Powered Triage - THE MOAT */}
      <section className="py-32 px-6 relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-gradient-to-r from-violet-950/50 via-purple-950/50 to-indigo-950/50" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-violet-600/20 rounded-full blur-3xl" />
        
        <div className="max-w-7xl mx-auto relative">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left - Content */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/20 border border-violet-500/30 mb-6">
                <Sparkles className="w-4 h-4 text-violet-400" />
                <span className="text-sm text-violet-300 font-medium">Our Secret Weapon</span>
              </div>
              
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                <span className="text-white">AI-Powered</span>
                <br />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-purple-400 to-pink-400">
                  Incident Triage
                </span>
              </h2>
              
              <p className="text-xl text-white/70 mb-8 leading-relaxed">
                While competitors leave you digging through logs, our AI automatically 
                analyzes incidents, identifies root causes, and suggests fixes. 
                <span className="text-white font-semibold"> Reduce MTTR by 80%.</span>
              </p>
              
              <div className="space-y-4 mb-8">
                {[
                  "Automatic root cause analysis",
                  "Intelligent incident clustering",
                  "AI-suggested remediation steps",
                  "Pattern detection across requests",
                  "Proactive anomaly warnings",
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 + i * 0.05 }}
                    className="flex items-center gap-3"
                  >
                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-violet-500 to-purple-500 flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-white/80">{item}</span>
                  </motion.div>
                ))}
              </div>
              
              <button 
                onClick={handleOpenSignup}
                className="px-8 py-4 bg-gradient-to-r from-violet-600 to-purple-600 rounded-2xl font-semibold text-lg hover:from-violet-500 hover:to-purple-500 transition-all duration-300 inline-flex items-center gap-2 group"
              >
                See AI Triage in Action
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>
            
            {/* Right - Visual */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="absolute -inset-4 bg-gradient-to-r from-violet-600 to-purple-600 rounded-3xl blur-2xl opacity-30" />
              <div className="relative bg-[#0d1117] rounded-2xl border border-white/10 p-6 overflow-hidden">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="ml-2 text-white/40 text-xs">AI Triage Analysis</span>
                </div>
                
                {/* Mock AI Analysis */}
                <div className="space-y-4">
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-red-400 text-sm font-medium">Incident Detected</span>
                    </div>
                    <p className="text-white/70 text-sm">High latency spike on GPT-4 requests (p99: 8.2s)</p>
                  </div>
                  
                  <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Bot className="w-4 h-4 text-violet-400" />
                      <span className="text-violet-400 text-sm font-medium">AI Analysis</span>
                    </div>
                    <p className="text-white/70 text-sm mb-3">
                      Analyzing 1,247 affected requests...
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span className="text-white/70">Root cause: Token limit exceeded in prompt template</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span className="text-white/70">Pattern: Requests with user_context &gt; 4000 chars</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400 text-sm font-medium">Suggested Fix</span>
                    </div>
                    <p className="text-white/70 text-sm">
                      Truncate user_context to 3000 chars or switch to gpt-4-turbo for longer context.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-32 px-6 bg-gradient-to-b from-transparent via-violet-950/20 to-transparent">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-5xl font-bold mb-6"
            >
              Get Started in
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400"> 2 Minutes</span>
            </motion.h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Change Your Base URL",
                description: "Point your OpenAI/Anthropic client to our proxy. That's literally it.",
                icon: Code2,
              },
              {
                step: "02",
                title: "Add Your API Key",
                description: "Include your Tracevox key in the headers. We'll handle authentication.",
                icon: Lock,
              },
              {
                step: "03",
                title: "Watch the Magic",
                description: "Every request is now logged, analyzed, and ready for you in real-time.",
                icon: Sparkles,
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative"
              >
                <div className="text-8xl font-bold text-white/5 absolute -top-6 left-0">
                  {item.step}
                </div>
                <div className="relative bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10">
                  <item.icon className="w-10 h-10 text-violet-400 mb-6" />
                  <h3 className="text-xl font-semibold text-white mb-3">{item.title}</h3>
                  <p className="text-white/60">{item.description}</p>
                </div>
                {i < 2 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 transform translate-x-full">
                    <ArrowRight className="w-8 h-8 text-white/20" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Tracevox - Comparison */}
      <section className="py-32 px-6 bg-gradient-to-b from-violet-950/20 to-transparent">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-5xl font-bold mb-6"
            >
              Why Choose
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400"> Tracevox?</span>
            </motion.h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Us */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-gradient-to-br from-violet-900/30 to-purple-900/30 rounded-3xl p-8 border border-violet-500/30"
            >
              <div className="flex items-center mb-6">
                <img src="/logo-tracevox-full.svg" alt="Tracevox" className="h-14" />
              </div>
              <ul className="space-y-4">
                {[
                  "AI-powered incident triage (unique!)",
                  "One-line integration",
                  "Real-time streaming support",
                  "Automatic cost calculation",
                  "Provider fallback routing",
                  "Response caching built-in",
                  "Dual-database architecture",
                  "Open source friendly",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/80">
                    <Check className="w-5 h-5 text-emerald-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Others */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-white/5 rounded-3xl p-8 border border-white/10"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <span className="text-white/50 text-lg">?</span>
                </div>
                <span className="text-xl font-bold text-white/50">Other Solutions</span>
              </div>
              <ul className="space-y-4">
                {[
                  "Manual log analysis",
                  "Complex SDK integration",
                  "No streaming support",
                  "Manual cost tracking",
                  "No automatic failover",
                  "No caching",
                  "Single database",
                  "Vendor lock-in",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/40">
                    <X className="w-5 h-5 text-red-400/50 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-5xl font-bold mb-6"
            >
              Simple, Transparent
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-400"> Pricing</span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-xl text-white/60 max-w-2xl mx-auto mb-8"
            >
              Start free, scale as you grow. No hidden fees, no surprises.
            </motion.p>
            
            {/* Annual/Monthly Toggle */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-4 p-1 bg-white/5 rounded-full border border-white/10"
            >
              <button
                onClick={() => setIsAnnual(false)}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  !isAnnual 
                    ? "bg-white text-black" 
                    : "text-white/70 hover:text-white"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setIsAnnual(true)}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
                  isAnnual 
                    ? "bg-white text-black" 
                    : "text-white/70 hover:text-white"
                }`}
              >
                Annual
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  isAnnual 
                    ? "bg-emerald-500 text-white" 
                    : "bg-emerald-500/20 text-emerald-400"
                }`}>
                  Save 20%
                </span>
              </button>
            </motion.div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {pricingPlans.map((plan, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <PricingCard
                  {...plan}
                  isAnnual={isAnnual}
                  underDevelopment={plan.name === "Enterprise" && !showEnterpriseFeatures}
                />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-32 px-6 bg-[#0a0a14]">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-5xl font-bold mb-6"
            >
              Frequently Asked Questions
            </motion.h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <FAQItem
                key={i}
                {...faq}
                isOpen={openFAQ === i}
                onClick={() => setOpenFAQ(openFAQ === i ? null : i)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-purple-600 rounded-3xl blur-3xl opacity-30" />
            <div className="relative bg-gradient-to-r from-violet-900/50 to-purple-900/50 backdrop-blur-xl rounded-3xl p-12 md:p-20 border border-white/10">
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                Ready to get started?
              </h2>
              <p className="text-xl text-white/60 mb-10 max-w-2xl mx-auto">
                Try Tracevox for free—open source LLM observability. Self-host or use our cloud 
                to monitor, debug, and optimize your LLM applications.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-10 py-5 bg-white text-black rounded-2xl font-semibold text-lg hover:bg-white/90 transition-all duration-300 inline-flex items-center gap-3 group"
                >
                  <Github className="w-6 h-6" />
                  View on GitHub
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </a>
                <button 
                  onClick={handleOpenSignup}
                  className="px-10 py-5 bg-white/10 border border-white/20 text-white rounded-2xl font-semibold text-lg hover:bg-white/20 transition-all duration-300 inline-flex items-center gap-3 group"
                >
                  Get Started Free
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
              <p className="text-white/40 text-sm mt-6">
                Open source • No credit card required • Self-host or cloud
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-5 gap-12 mb-12">
            <div className="md:col-span-2">
              <div className="flex items-center mb-4">
                <img src="/logo-tracevox-full.svg" alt="Tracevox" className="h-14" />
              </div>
              <p className="text-white/50 max-w-sm mb-4">
                Open source LLM observability. Monitor, debug, and optimize 
                your AI applications—self-host or use our cloud.
              </p>
              {/* Status Badge */}
              <a 
                href="/status" 
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full hover:bg-emerald-500/20 transition-colors"
              >
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-emerald-400 text-sm font-medium">All systems operational</span>
              </a>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-3 text-white/50">
                <li><a href="#features" onClick={(e) => scrollToSection(e, "features")} className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" onClick={(e) => scrollToSection(e, "pricing")} className="hover:text-white transition-colors">Pricing</a></li>
                <li><button onClick={onOpenDocs} className="hover:text-white transition-colors">Documentation</button></li>
                <li><a href="/changelog" className="hover:text-white transition-colors flex items-center gap-2">Changelog <span className="text-xs bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded">New</span></a></li>
                <li><a href="/status" className="hover:text-white transition-colors">Status Page</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Resources</h4>
              <ul className="space-y-3 text-white/50">
                <li><a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors inline-flex items-center gap-1.5"><Github className="w-4 h-4" /> GitHub</a></li>
                <li><a href="/blog" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="/guides" className="hover:text-white transition-colors">Guides</a></li>
                <li><a href="/api-reference" className="hover:text-white transition-colors">API Reference</a></li>
                <li><a href="/community" className="hover:text-white transition-colors">Community</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-3 text-white/50">
                <li><a href="/about" className="hover:text-white transition-colors">About</a></li>
                <li><a href="/contact" className="hover:text-white transition-colors">Contact</a></li>
                <li><a href="/privacy" className="hover:text-white transition-colors">Privacy</a></li>
                <li><a href="/terms" className="hover:text-white transition-colors">Terms</a></li>
                <li><a href="/security" className="hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-white/40 text-sm">
              © 2025 Tracevox by Neuralrocks. All rights reserved.
            </div>
            <div className="flex items-center gap-6">
              <a href="https://twitter.com" className="text-white/40 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-white transition-colors" aria-label="GitHub">
                <Github className="w-5 h-5" />
              </a>
              <a href="https://linkedin.com" className="text-white/40 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
              <a href="https://discord.com" className="text-white/40 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
        initialMode={authMode}
      />

      {/* Video Demo Modal */}
      <AnimatePresence>
        {showVideoModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl"
            onClick={() => setShowVideoModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-5xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                onClick={() => setShowVideoModal(false)}
                className="absolute -top-12 right-0 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-6 h-6 text-white" />
              </button>
              
              {/* YouTube Video Container */}
              <div className="relative rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl aspect-video">
                <iframe
                  className="w-full h-full"
                  src="https://www.youtube-nocookie.com/embed/mSFz66XleUQ?autoplay=1&rel=0&modestbranding=1"
                  title="Tracevox Platform Demo"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              
              {/* Video Title */}
              <div className="mt-4 text-center">
                <h3 className="text-xl font-semibold text-white">Tracevox Platform Demo</h3>
                <p className="text-white/60 text-sm mt-1">See how Tracevox monitors your LLM applications</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cookie Consent Banner */}
      <AnimatePresence>
        {showCookieConsent && (
          <CookieConsent 
            onAccept={handleCookieAccept} 
            onDecline={handleCookieDecline} 
          />
        )}
      </AnimatePresence>

      {/* Live Chat Widget */}
      <LiveChatWidget />
    </div>
  );
};

export default LandingPage;

