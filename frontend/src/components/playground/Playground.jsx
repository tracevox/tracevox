/**
 * Prompt Playground Component
 * 
 * Test prompts directly in the UI with real-time feedback.
 * Features:
 * - Multi-model comparison
 * - Token and cost tracking
 * - Save as template
 * - Conversation history
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Plus, Trash2, Save, Copy, Check, ChevronDown,
  Loader2, AlertCircle, Sparkles, Zap, DollarSign, Clock,
  MessageSquare, Settings2, History, Code2, ArrowLeft,
  RotateCcw, Send, Bot, User as UserIcon, Terminal
} from 'lucide-react';
import * as api from '../../lib/api';

// Simple markdown-like formatting for assistant responses
function FormattedResponse({ content }) {
  if (!content) return null;
  
  // Process the content for markdown-like formatting
  const formatContent = (text) => {
    // Split into lines and process
    const lines = text.split('\n');
    const elements = [];
    let inCodeBlock = false;
    let codeContent = [];
    let codeLanguage = '';
    
    lines.forEach((line, idx) => {
      // Code block handling
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLanguage = line.slice(3).trim();
          codeContent = [];
        } else {
          elements.push(
            <pre key={`code-${idx}`} className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto my-3 text-sm font-mono">
              {codeLanguage && <div className="text-xs text-zinc-500 mb-2">{codeLanguage}</div>}
              <code>{codeContent.join('\n')}</code>
            </pre>
          );
          inCodeBlock = false;
          codeContent = [];
          codeLanguage = '';
        }
        return;
      }
      
      if (inCodeBlock) {
        codeContent.push(line);
        return;
      }
      
      // Headers
      if (line.startsWith('### ')) {
        elements.push(<h3 key={idx} className="text-lg font-bold mt-4 mb-2">{line.slice(4)}</h3>);
        return;
      }
      if (line.startsWith('## ')) {
        elements.push(<h2 key={idx} className="text-xl font-bold mt-4 mb-2">{line.slice(3)}</h2>);
        return;
      }
      if (line.startsWith('# ')) {
        elements.push(<h1 key={idx} className="text-2xl font-bold mt-4 mb-2">{line.slice(2)}</h1>);
        return;
      }
      
      // Bullet points
      if (line.match(/^\s*[-*]\s+/)) {
        const indent = line.match(/^(\s*)/)[1].length;
        const content = line.replace(/^\s*[-*]\s+/, '');
        elements.push(
          <div key={idx} className="flex gap-2 my-1" style={{ paddingLeft: `${indent * 8}px` }}>
            <span className="text-purple-400">•</span>
            <span>{formatInlineText(content)}</span>
          </div>
        );
        return;
      }
      
      // Numbered lists
      if (line.match(/^\s*\d+\.\s+/)) {
        const num = line.match(/^\s*(\d+)\./)[1];
        const content = line.replace(/^\s*\d+\.\s+/, '');
        elements.push(
          <div key={idx} className="flex gap-2 my-1">
            <span className="text-purple-400 font-medium min-w-[20px]">{num}.</span>
            <span>{formatInlineText(content)}</span>
          </div>
        );
        return;
      }
      
      // Empty lines
      if (line.trim() === '') {
        elements.push(<div key={idx} className="h-2" />);
        return;
      }
      
      // Regular paragraphs
      elements.push(<p key={idx} className="my-1">{formatInlineText(line)}</p>);
    });
    
    return elements;
  };
  
  // Format inline text (bold, italic, code)
  const formatInlineText = (text) => {
    // Split by inline code first
    const parts = text.split(/(`[^`]+`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={idx} className="bg-zinc-800 text-purple-300 px-1.5 py-0.5 rounded text-sm font-mono">{part.slice(1, -1)}</code>;
      }
      // Bold
      let formatted = part.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      // Italic
      formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      
      if (formatted !== part) {
        return <span key={idx} dangerouslySetInnerHTML={{ __html: formatted }} />;
      }
      return part;
    });
  };
  
  return <div className="prose prose-sm prose-invert max-w-none">{formatContent(content)}</div>;
}

export function Playground({ onBack }) {
  // State
  const [messages, setMessages] = useState([
    { role: 'system', content: 'You are a helpful assistant.' }
  ]);
  const [provider, setProvider] = useState(null); // Will be set from stored config
  const [model, setModel] = useState(null); // Will be set from stored config
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [userInput, setUserInput] = useState('');
  
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [providers, setProviders] = useState([]);
  const [pricing, setPricing] = useState({});
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareModels, setCompareModels] = useState([
    { provider: 'openai', model: 'gpt-4o-mini' },
    { provider: 'anthropic', model: 'claude-3-haiku-20240307' }
  ]);
  const [compareResults, setCompareResults] = useState([]);
  
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [copied, setCopied] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  
  // Ref for auto-scrolling
  const messagesContainerRef = useRef(null);

  // Load providers, user config, and history
  useEffect(() => {
    loadProviders();
    loadUserConfig();
    loadHistory();
  }, []);
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function loadProviders() {
    try {
      const data = await api.getPlaygroundModels();
      setProviders(data.providers || []);
      setPricing(data.pricing || {});
    } catch (err) {
      console.error('Failed to load providers:', err);
    }
  }

  async function loadUserConfig() {
    setConfigLoading(true);
    try {
      // Fetch user's stored LLM credentials configuration
      const config = await api.getCredentialConfig();
      if (config.configured) {
        // Use stored provider and model
        setProvider(config.provider);
        setModel(config.default_model);
      } else {
        // Fallback to default if no config
        setProvider('openai');
        setModel('gpt-4o-mini');
      }
    } catch (err) {
      console.error('Failed to load user config:', err);
      // Fallback to defaults
      setProvider('openai');
      setModel('gpt-4o-mini');
    } finally {
      setConfigLoading(false);
    }
  }

  async function loadHistory() {
    try {
      const data = await api.getPlaygroundHistory(20);
      setHistory(data.history || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }

  async function handleRun() {
    if (!userInput.trim()) return;
    
    setLoading(true);
    setError(null);
    setResponse(null);
    
    // Add user message
    const newMessages = [...messages, { role: 'user', content: userInput }];
    setMessages(newMessages);
    setUserInput('');
    
    try {
      if (compareMode) {
        // Run comparison
        const data = await api.compareModels({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          models: compareModels,
          temperature,
          max_tokens: maxTokens,
        });
        setCompareResults(data.results || []);
      } else {
        // Single run - send provider/model only if set (otherwise backend uses stored config)
        const requestBody = {
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          temperature,
          max_tokens: maxTokens,
        };
        // Only include provider/model if explicitly set
        if (provider) requestBody.provider = provider;
        if (model) requestBody.model = model;
        
        const data = await api.runPlayground(requestBody);
        
        setResponse(data);
        // Add assistant response
        setMessages([...newMessages, { role: 'assistant', content: data.content }]);
      }
      
      loadHistory();
    } catch (err) {
      setError(err.message || 'Failed to run prompt');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAsTemplate() {
    if (!templateName.trim()) return;
    
    try {
      await api.savePlaygroundAsTemplate({
        name: templateName,
        description: templateDescription,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        default_model: model,
        default_provider: provider,
      });
      
      setSaveModalOpen(false);
      setTemplateName('');
      setTemplateDescription('');
    } catch (err) {
      setError(err.message || 'Failed to save template');
    }
  }

  function handleCopy(text) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function clearConversation() {
    setMessages([{ role: 'system', content: 'You are a helpful assistant.' }]);
    setResponse(null);
    setCompareResults([]);
  }

  function loadFromHistory(item) {
    setMessages(item.messages || []);
    setShowHistory(false);
  }

  function addMessage() {
    setMessages([...messages, { role: 'user', content: '' }]);
  }

  function updateMessage(index, field, value) {
    const updated = [...messages];
    updated[index][field] = value;
    setMessages(updated);
  }

  function removeMessage(index) {
    setMessages(messages.filter((_, i) => i !== index));
  }

  const currentProviderModels = providers.find(p => p.id === provider)?.models || [];
  const hasCredentials = provider && model;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-sm">
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
              <Terminal className="h-5 w-5 text-purple-500" />
              <h1 className="text-xl font-bold">Prompt Playground</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                showHistory ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-muted'
              }`}
            >
              <History className="h-4 w-4" />
              History
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                showSettings ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-muted'
              }`}
            >
              <Settings2 className="h-4 w-4" />
              Settings
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar - History or Settings */}
        <AnimatePresence>
          {(showHistory || showSettings) && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-r overflow-hidden"
            >
              <div className="p-4 w-80">
                {showHistory ? (
                  <>
                    <h3 className="font-semibold mb-4">Recent History</h3>
                    <div className="space-y-2">
                      {history.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No history yet</p>
                      ) : (
                        history.map((item, i) => (
                          <button
                            key={i}
                            onClick={() => loadFromHistory(item)}
                            className="w-full p-3 rounded-lg border hover:bg-muted text-left"
                          >
                            <div className="text-sm font-medium truncate">
                              {item.messages?.[item.messages.length - 2]?.content?.slice(0, 50) || 'Untitled'}...
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                              <span>{item.model}</span>
                              <span>•</span>
                              <span>{item.tokens?.total} tokens</span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="font-semibold mb-4">Settings</h3>
                    
                    {/* Compare Mode Toggle */}
                    <div className="mb-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={compareMode}
                          onChange={(e) => setCompareMode(e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-sm">Compare Mode</span>
                      </label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Test the same prompt across multiple models
                      </p>
                    </div>
                    
                    {!compareMode && (
                      <>
                        {/* Provider */}
                        <div className="mb-4">
                          <label className="text-sm font-medium block mb-2">Provider</label>
                          <select
                            value={provider}
                            onChange={(e) => {
                              setProvider(e.target.value);
                              const prov = providers.find(p => p.id === e.target.value);
                              if (prov?.models?.[0]) setModel(prov.models[0].id);
                            }}
                            className="w-full px-3 py-2 rounded-lg border bg-background"
                          >
                            {providers.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        
                        {/* Model */}
                        <div className="mb-4">
                          <label className="text-sm font-medium block mb-2">Model</label>
                          <select
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border bg-background"
                          >
                            {currentProviderModels.map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                    
                    {/* Temperature */}
                    <div className="mb-4">
                      <label className="text-sm font-medium block mb-2">
                        Temperature: {temperature}
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    
                    {/* Max Tokens */}
                    <div className="mb-4">
                      <label className="text-sm font-medium block mb-2">Max Tokens</label>
                      <input
                        type="number"
                        value={maxTokens}
                        onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                        min="1"
                        max="32000"
                        className="w-full px-3 py-2 rounded-lg border bg-background"
                      />
                    </div>
                  </>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden">
          <div className="max-w-4xl mx-auto w-full flex flex-col h-full p-6">
            {/* Scrollable Messages Container */}
            <div 
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent min-h-[300px]"
            >
              {messages.map((msg, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`p-4 rounded-lg border ${
                    msg.role === 'system' ? 'bg-yellow-500/10 border-yellow-500/30' :
                    msg.role === 'user' ? 'bg-blue-500/10 border-blue-500/30' :
                    'bg-emerald-500/10 border-emerald-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {msg.role === 'system' ? (
                        <Settings2 className="h-4 w-4 text-yellow-500" />
                      ) : msg.role === 'user' ? (
                        <UserIcon className="h-4 w-4 text-blue-500" />
                      ) : (
                        <Bot className="h-4 w-4 text-emerald-500" />
                      )}
                      <span className="text-sm font-medium capitalize">{msg.role}</span>
                    </div>
                    
                    {msg.role !== 'assistant' && (
                      <div className="flex items-center gap-1">
                        <select
                          value={msg.role}
                          onChange={(e) => updateMessage(index, 'role', e.target.value)}
                          className="text-xs px-2 py-1 rounded border bg-background"
                        >
                          <option value="system">System</option>
                          <option value="user">User</option>
                        </select>
                        {index > 0 && (
                          <button
                            onClick={() => removeMessage(index)}
                            className="p-1 hover:bg-muted rounded"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                    
                    {msg.role === 'assistant' && (
                      <button
                        onClick={() => handleCopy(msg.content)}
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                        title="Copy response"
                      >
                        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                  
                  {msg.role !== 'assistant' ? (
                    <textarea
                      value={msg.content}
                      onChange={(e) => updateMessage(index, 'content', e.target.value)}
                      placeholder={msg.role === 'system' ? 'System prompt...' : 'User message...'}
                      className="w-full bg-transparent resize-none outline-none text-sm min-h-[60px]"
                      rows={3}
                    />
                  ) : (
                    <div className="text-sm">
                      <FormattedResponse content={msg.content} />
                    </div>
                  )}
                </motion.div>
              ))}
              
              {/* Loading indicator */}
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-4 rounded-lg border bg-emerald-500/10 border-emerald-500/30"
                >
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm font-medium">Assistant</span>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </motion.div>
              )}

              {/* Response Stats - Inside scrollable area */}
              {response && !compareMode && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 border rounded-lg bg-card"
                >
                  <h3 className="font-semibold mb-3">Response Statistics</h3>
                  
                  {/* Main Stats Row */}
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center p-3 bg-purple-500/10 rounded-lg">
                      <Zap className="h-5 w-5 mx-auto text-purple-500 mb-1" />
                      <div className="text-2xl font-bold">{response.latency_ms}ms</div>
                      <div className="text-xs text-muted-foreground">Latency</div>
                    </div>
                    <div className="text-center p-3 bg-emerald-500/10 rounded-lg">
                      <DollarSign className="h-5 w-5 mx-auto text-emerald-500 mb-1" />
                      <div className="text-2xl font-bold">${response.cost?.total_cost_usd?.toFixed(6) || 0}</div>
                      <div className="text-xs text-muted-foreground">Total Cost</div>
                    </div>
                    <div className="text-center p-3 bg-yellow-500/10 rounded-lg">
                      <Sparkles className="h-5 w-5 mx-auto text-yellow-500 mb-1" />
                      <div className="text-lg font-bold truncate">{response.model}</div>
                      <div className="text-xs text-muted-foreground">Model</div>
                    </div>
                  </div>
                  
                  {/* Token Breakdown */}
                  <div className="p-3 bg-blue-500/10 rounded-lg mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium">Token Breakdown</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-lg font-bold text-blue-400">{response.tokens?.prompt || 0}</div>
                        <div className="text-xs text-muted-foreground">Input (Prompt)</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-emerald-400">{response.tokens?.completion || 0}</div>
                        <div className="text-xs text-muted-foreground">Output (Response)</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold">{response.tokens?.total || 0}</div>
                        <div className="text-xs text-muted-foreground">Total</div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground text-center">
                      Max output tokens setting: <span className="font-mono">{maxTokens}</span>
                    </div>
                  </div>

                  {/* Cost Breakdown */}
                  {response.cost && (
                    <div className="p-3 bg-muted/30 rounded-lg mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <DollarSign className="h-4 w-4 text-emerald-500" />
                        <span className="text-sm font-medium">Cost Breakdown</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-center text-sm">
                        <div>
                          <div className="font-mono">${response.cost?.input_cost_usd?.toFixed(6) || 0}</div>
                          <div className="text-xs text-muted-foreground">Input Cost</div>
                        </div>
                        <div>
                          <div className="font-mono">${response.cost?.output_cost_usd?.toFixed(6) || 0}</div>
                          <div className="text-xs text-muted-foreground">Output Cost</div>
                        </div>
                        <div>
                          <div className="font-mono font-bold">${response.cost?.total_cost_usd?.toFixed(6) || 0}</div>
                          <div className="text-xs text-muted-foreground">Total Cost</div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopy(response.content)}
                      className="px-3 py-2 border rounded-lg hover:bg-muted flex items-center gap-2 text-sm"
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied ? 'Copied!' : 'Copy Response'}
                    </button>
                    <button
                      onClick={() => setSaveModalOpen(true)}
                      className="px-3 py-2 border rounded-lg hover:bg-muted flex items-center gap-2 text-sm"
                    >
                      <Save className="h-4 w-4" />
                      Save as Template
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Compare Results - Inside scrollable area */}
              {compareMode && compareResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid grid-cols-2 gap-4"
                >
                  {compareResults.map((result, i) => (
                    <div key={i} className="p-4 border rounded-lg bg-card">
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-semibold">{result.model}</div>
                        <div className="text-xs text-muted-foreground">{result.provider}</div>
                      </div>
                      
                      {result.error ? (
                        <div className="p-3 bg-red-500/10 rounded text-red-500 text-sm">
                          {result.error}
                        </div>
                      ) : (
                        <>
                          <div className="text-sm mb-4 max-h-[200px] overflow-y-auto">
                            <FormattedResponse content={result.content} />
                          </div>
                          
                          <div className="grid grid-cols-4 gap-2 text-center text-xs">
                            <div>
                              <div className="font-bold">{result.latency_ms}ms</div>
                              <div className="text-muted-foreground">Latency</div>
                            </div>
                            <div>
                              <div className="font-bold text-blue-400">{result.tokens?.prompt || 0}</div>
                              <div className="text-muted-foreground">Input</div>
                            </div>
                            <div>
                              <div className="font-bold text-emerald-400">{result.tokens?.completion || 0}</div>
                              <div className="text-muted-foreground">Output</div>
                            </div>
                            <div>
                              <div className="font-bold">${result.cost?.total_cost_usd?.toFixed(6) || 0}</div>
                              <div className="text-muted-foreground">Cost</div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </motion.div>
              )}
            </div>

            {/* Bottom Input Section - Sticky */}
            <div className="flex-shrink-0 border-t bg-background pt-4 space-y-3">
              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={addMessage}
                  className="px-3 py-2 border rounded-lg hover:bg-muted flex items-center gap-2 text-sm"
                >
                  <Plus className="h-4 w-4" />
                  Add Message
                </button>
                <button
                  onClick={clearConversation}
                  className="px-3 py-2 border rounded-lg hover:bg-muted flex items-center gap-2 text-sm"
                >
                  <RotateCcw className="h-4 w-4" />
                  Clear
                </button>
              </div>

              {/* Current Config Display */}
              {configLoading ? (
                <div className="p-3 bg-muted rounded-lg flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading configuration...</span>
                </div>
              ) : hasCredentials ? (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm">
                    Using <strong className="capitalize">{provider}</strong> with <strong>{model}</strong>
                  </span>
                </div>
              ) : (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-amber-500">
                    No LLM credentials configured. <a href="/settings" className="underline">Go to Settings</a> to add your API key.
                  </span>
                </div>
              )}

              {/* User Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleRun()}
                  placeholder="Type your message and press Enter..."
                  className="flex-1 px-4 py-3 rounded-lg border bg-background"
                  disabled={configLoading || !hasCredentials}
                />
                <button
                  onClick={handleRun}
                  disabled={loading || !userInput.trim() || configLoading || !hasCredentials}
                  className="px-6 py-3 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg flex items-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                  Run
                </button>
              </div>

              {/* Error */}
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  <span className="text-red-500">{error}</span>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Save as Template Modal */}
      <AnimatePresence>
        {saveModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setSaveModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-card border rounded-xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-4">Save as Template</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium block mb-2">Template Name</label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="My Awesome Prompt"
                    className="w-full px-3 py-2 rounded-lg border bg-background"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium block mb-2">Description (optional)</label>
                  <textarea
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="What does this prompt do?"
                    className="w-full px-3 py-2 rounded-lg border bg-background"
                    rows={3}
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setSaveModalOpen(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAsTemplate}
                  disabled={!templateName.trim()}
                  className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg"
                >
                  Save Template
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

