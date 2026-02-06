import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Settings, Users, CreditCard, Bell, Shield, LayoutDashboard,
  Key, Building2, ChevronRight, Moon, Sun, ArrowLeft, Bot,
  Check, AlertCircle, Loader2, Eye, EyeOff, Trash2, Mail,
  MessageSquare, Plus, X, Send
} from 'lucide-react';
import BillingPage from './BillingPage';
import TeamPage from './TeamPage';
import AlertsPage from './AlertsPage';
import SSOPage from './SSOPage';
import * as api from '../../lib/api';
import { getHealth } from '../../lib/api';

const ALL_TABS = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'llm', label: 'LLM Configuration', icon: Bot },
  { id: 'notifications', label: 'Notifications', icon: Mail },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'sso', label: 'Single Sign-On', icon: Shield, badge: 'Enterprise' },
];

const LLM_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...', models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'] },
  { id: 'google', name: 'Google', placeholder: 'AIza...', models: ['gemini-2.0-flash-exp', 'gemini-1.5-pro-latest', 'gemini-1.5-flash-latest', 'gemini-pro'] },
];

export function SettingsPage({ user, org, onBack, onApiKeys }) {
  const [activeTab, setActiveTab] = useState('general');
  const [showEnterpriseFeatures, setShowEnterpriseFeatures] = useState(true);

  useEffect(() => {
    getHealth().then((h) => setShowEnterpriseFeatures(h.show_enterprise_features !== false)).catch(() => {});
  }, []);

  const TABS = showEnterpriseFeatures ? ALL_TABS : ALL_TABS.filter((t) => t.id !== 'sso');

  useEffect(() => {
    if (!TABS.some((t) => t.id === activeTab)) setActiveTab('general');
  }, [TABS, activeTab]);

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('tracevox_theme') || 
           (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  });
  const [saving, setSaving] = useState(false);
  const [orgName, setOrgName] = useState(org?.name || '');
  const [success, setSuccess] = useState(null);
  
  // LLM Configuration state
  const [llmProvider, setLlmProvider] = useState('openai');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmModel, setLlmModel] = useState('gpt-4o-mini');
  const [showApiKey, setShowApiKey] = useState(false);
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmSuccess, setLlmSuccess] = useState(null);
  const [llmError, setLlmError] = useState(null);
  const [existingCredentials, setExistingCredentials] = useState(null);
  const [loadingCredentials, setLoadingCredentials] = useState(false);
  
  // Notification settings state
  const [notifSettings, setNotifSettings] = useState({
    admin_emails: ['customercare@neuralrocks.com'],
    slack_webhook_url: '',
    discord_webhook_url: '',
    email_enabled: true,
    slack_enabled: true,
    discord_enabled: true,
    notify_on_signup: true,
    notify_on_limit_warning: true,
    notify_on_payment: true,
  });
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSuccess, setNotifSuccess] = useState(null);
  const [notifError, setNotifError] = useState(null);
  const [testingNotif, setTestingNotif] = useState(false);
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem('tracevox_theme', theme);
  }, [theme]);
  
  // Load existing LLM credentials on mount
  useEffect(() => {
    async function loadCredentials() {
      setLoadingCredentials(true);
      try {
        const data = await api.getCredentialConfig();
        if (data && data.provider) {
          setExistingCredentials(data);
          setLlmProvider(data.provider);
          setLlmModel(data.default_model || '');
        }
      } catch (err) {
        console.error('Failed to load credentials:', err);
      } finally {
        setLoadingCredentials(false);
      }
    }
    loadCredentials();
  }, []);
  
  // Load notification settings on mount
  useEffect(() => {
    async function loadNotifSettings() {
      setNotifLoading(true);
      try {
        const data = await api.getNotificationSettings();
        if (data) {
          setNotifSettings(data);
        }
      } catch (err) {
        console.error('Failed to load notification settings:', err);
      } finally {
        setNotifLoading(false);
      }
    }
    loadNotifSettings();
  }, []);

  async function handleSaveGeneral(e) {
    e.preventDefault();
    setSaving(true);
    try {
      // API call to update org settings would go here
      setSuccess('Settings saved');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }
  
  async function handleSaveLlmCredentials(e) {
    e.preventDefault();
    if (!llmApiKey && !existingCredentials) {
      setLlmError('Please enter an API key');
      return;
    }
    
    setLlmSaving(true);
    setLlmError(null);
    setLlmSuccess(null);
    
    try {
      await api.saveCredentials({
        provider: llmProvider,
        api_key: llmApiKey || undefined,
        default_model: llmModel,
      });
      setLlmSuccess('LLM credentials saved successfully!');
      setLlmApiKey('');
      setExistingCredentials({ provider: llmProvider, default_model: llmModel });
      setTimeout(() => setLlmSuccess(null), 3000);
    } catch (err) {
      setLlmError(err.message || 'Failed to save credentials');
    } finally {
      setLlmSaving(false);
    }
  }
  
  async function handleTestLlmCredentials() {
    if (!llmApiKey && !existingCredentials) {
      setLlmError('Please enter an API key first');
      return;
    }
    
    setLlmTesting(true);
    setLlmError(null);
    setLlmSuccess(null);
    
    try {
      await api.testCredentialConnection();
      setLlmSuccess('Connection successful! Your API key is working.');
      setTimeout(() => setLlmSuccess(null), 3000);
    } catch (err) {
      setLlmError(err.message || 'Connection failed. Please check your API key.');
    } finally {
      setLlmTesting(false);
    }
  }
  
  async function handleDeleteLlmCredentials() {
    if (!confirm('Are you sure you want to delete your LLM credentials?')) return;
    
    setLlmSaving(true);
    setLlmError(null);
    
    try {
      await api.deleteCredentials();
      setExistingCredentials(null);
      setLlmApiKey('');
      setLlmSuccess('Credentials deleted');
      setTimeout(() => setLlmSuccess(null), 3000);
    } catch (err) {
      setLlmError(err.message || 'Failed to delete credentials');
    } finally {
      setLlmSaving(false);
    }
  }
  
  const currentProviderModels = LLM_PROVIDERS.find(p => p.id === llmProvider)?.models || [];
  const currentProviderPlaceholder = LLM_PROVIDERS.find(p => p.id === llmProvider)?.placeholder || '';
  
  // Notification handlers
  async function handleSaveNotifSettings(e) {
    e.preventDefault();
    setNotifSaving(true);
    setNotifError(null);
    setNotifSuccess(null);
    
    try {
      await api.updateNotificationSettings(notifSettings);
      setNotifSuccess('Notification settings saved!');
      setTimeout(() => setNotifSuccess(null), 3000);
    } catch (err) {
      setNotifError(err.message || 'Failed to save settings');
    } finally {
      setNotifSaving(false);
    }
  }
  
  function handleAddEmail() {
    if (!newEmail || !newEmail.includes('@')) return;
    if (notifSettings.admin_emails.includes(newEmail)) return;
    setNotifSettings({
      ...notifSettings,
      admin_emails: [...notifSettings.admin_emails, newEmail],
    });
    setNewEmail('');
  }
  
  function handleRemoveEmail(email) {
    if (notifSettings.admin_emails.length <= 1) return; // Keep at least one
    setNotifSettings({
      ...notifSettings,
      admin_emails: notifSettings.admin_emails.filter(e => e !== email),
    });
  }
  
  async function handleTestNotification(channel) {
    setTestingNotif(true);
    setNotifError(null);
    try {
      await api.testNotification({ channel });
      setNotifSuccess(`Test ${channel} notification sent!`);
      setTimeout(() => setNotifSuccess(null), 3000);
    } catch (err) {
      setNotifError(err.message || 'Failed to send test notification');
    } finally {
      setTestingNotif(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800/50 border-b border-gray-700 sticky top-0 z-40 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-semibold text-white">Settings</h1>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0">
            <nav className="space-y-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-purple-600 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{tab.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {tab.badge && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400">
                          {tab.badge}
                        </span>
                      )}
                      <ChevronRight className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-600'}`} />
                    </div>
                  </button>
                );
              })}
              
              {/* API Keys Shortcut */}
              <button
                onClick={onApiKeys}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors mt-4 border border-gray-700"
              >
                <div className="flex items-center gap-3">
                  <Key className="w-5 h-5" />
                  <span className="font-medium">API Keys</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {activeTab === 'general' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                  <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-purple-400" />
                    Organization Settings
                  </h2>
                  
                  <form onSubmit={handleSaveGeneral} className="space-y-4">
                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-1">Organization Name</label>
                      <input
                        type="text"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        className="w-full max-w-md px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-1">Organization ID</label>
                      <input
                        type="text"
                        value={org?.id || ''}
                        disabled
                        className="w-full max-w-md px-3 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-gray-500 cursor-not-allowed"
                      />
                    </div>
                    
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    
                    {success && (
                      <p className="text-green-400 text-sm">{success}</p>
                    )}
                  </form>
                </div>

                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                  <h2 className="text-lg font-semibold text-white mb-4">Appearance</h2>
                  
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setTheme('light')}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
                        theme === 'light'
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <Sun className={`w-5 h-5 ${theme === 'light' ? 'text-purple-400' : 'text-gray-400'}`} />
                      <span className={theme === 'light' ? 'text-white' : 'text-gray-400'}>Light</span>
                    </button>
                    
                    <button
                      onClick={() => setTheme('dark')}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
                        theme === 'dark'
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <Moon className={`w-5 h-5 ${theme === 'dark' ? 'text-purple-400' : 'text-gray-400'}`} />
                      <span className={theme === 'dark' ? 'text-white' : 'text-gray-400'}>Dark</span>
                    </button>
                  </div>
                </div>

                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                  <h2 className="text-lg font-semibold text-white mb-4">User Profile</h2>
                  
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-2xl font-bold">
                      {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="text-white font-medium">{user?.name || 'Unknown'}</p>
                      <p className="text-gray-400">{user?.email}</p>
                      <p className="text-gray-500 text-sm mt-1">Role: {user?.role || 'member'}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'llm' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                  <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    <Bot className="w-5 h-5 text-purple-400" />
                    LLM Configuration
                  </h2>
                  <p className="text-gray-400 text-sm mb-6">
                    Configure your LLM provider credentials for Prompt Playground and AI Triage features.
                    Your API key is stored securely with enterprise-grade encryption.
                  </p>
                  
                  {loadingCredentials ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                    </div>
                  ) : (
                    <form onSubmit={handleSaveLlmCredentials} className="space-y-4">
                      {/* Current Status */}
                      {existingCredentials && (
                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg mb-4">
                          <div className="flex items-center gap-2 text-emerald-400 mb-1">
                            <Check className="w-4 h-4" />
                            <span className="font-medium">Credentials Configured</span>
                          </div>
                          <p className="text-gray-400 text-sm">
                            Provider: <span className="text-white">{existingCredentials.provider}</span> | 
                            Model: <span className="text-white">{existingCredentials.default_model}</span>
                          </p>
                        </div>
                      )}
                      
                      {/* Provider Selection */}
                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">Provider</label>
                        <div className="flex gap-3">
                          {LLM_PROVIDERS.map((provider) => (
                            <button
                              key={provider.id}
                              type="button"
                              onClick={() => {
                                setLlmProvider(provider.id);
                                setLlmModel(provider.models[0]);
                              }}
                              className={`px-4 py-2 rounded-lg border transition-colors ${
                                llmProvider === provider.id
                                  ? 'border-purple-500 bg-purple-500/20 text-white'
                                  : 'border-gray-700 hover:border-gray-600 text-gray-400'
                              }`}
                            >
                              {provider.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {/* API Key */}
                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">
                          API Key {existingCredentials && <span className="text-gray-500">(leave empty to keep existing)</span>}
                        </label>
                        <div className="relative max-w-md">
                          <input
                            type={showApiKey ? 'text' : 'password'}
                            value={llmApiKey}
                            onChange={(e) => setLlmApiKey(e.target.value)}
                            placeholder={existingCredentials ? '••••••••••••••••' : currentProviderPlaceholder}
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                          >
                            {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      
                      {/* Default Model */}
                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">Default Model</label>
                        <select
                          value={llmModel}
                          onChange={(e) => setLlmModel(e.target.value)}
                          className="w-full max-w-md px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          {currentProviderModels.map((model) => (
                            <option key={model} value={model}>{model}</option>
                          ))}
                        </select>
                      </div>
                      
                      {/* Error/Success Messages */}
                      {llmError && (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400">
                          <AlertCircle className="w-4 h-4" />
                          {llmError}
                        </div>
                      )}
                      
                      {llmSuccess && (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2 text-emerald-400">
                          <Check className="w-4 h-4" />
                          {llmSuccess}
                        </div>
                      )}
                      
                      {/* Buttons */}
                      <div className="flex items-center gap-3 pt-2">
                        <button
                          type="submit"
                          disabled={llmSaving}
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2"
                        >
                          {llmSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                          Save Credentials
                        </button>
                        
                        {existingCredentials && (
                          <>
                            <button
                              type="button"
                              onClick={handleTestLlmCredentials}
                              disabled={llmTesting}
                              className="px-4 py-2 border border-gray-700 hover:border-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                              {llmTesting && <Loader2 className="w-4 h-4 animate-spin" />}
                              Test Connection
                            </button>
                            
                            <button
                              type="button"
                              onClick={handleDeleteLlmCredentials}
                              className="px-4 py-2 text-red-400 hover:text-red-300 transition-colors flex items-center gap-2"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </form>
                  )}
                </div>
                
                {/* Info Box */}
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                  <h3 className="text-blue-400 font-medium mb-2">How it works</h3>
                  <ul className="text-gray-400 text-sm space-y-1">
                    <li>• Your API key is encrypted and stored in Google Cloud Secret Manager</li>
                    <li>• Used for Prompt Playground, AI Triage, and A/B Experiments</li>
                    <li>• You maintain full control - delete anytime</li>
                    <li>• All LLM costs are billed directly to your provider account</li>
                  </ul>
                </div>
              </motion.div>
            )}

            {activeTab === 'notifications' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                  <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    <Mail className="w-5 h-5 text-purple-400" />
                    Admin Email Notifications
                  </h2>
                  <p className="text-gray-400 text-sm mb-6">
                    Get notified when new users sign up, usage limits are approached, and other important events.
                  </p>
                  
                  {notifLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                    </div>
                  ) : (
                    <form onSubmit={handleSaveNotifSettings} className="space-y-6">
                      {/* Admin Emails */}
                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">Admin Email Addresses</label>
                        <div className="space-y-2 mb-3">
                          {notifSettings.admin_emails.map((email, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <input
                                type="email"
                                value={email}
                                disabled
                                className="flex-1 max-w-md px-3 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-gray-300 cursor-not-allowed"
                              />
                              {notifSettings.admin_emails.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveEmail(email)}
                                  className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 max-w-md">
                          <input
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="Add another email..."
                            className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                          <button
                            type="button"
                            onClick={handleAddEmail}
                            className="p-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-gray-500 text-xs mt-2">
                          These emails will receive notifications about new signups, usage warnings, and more.
                        </p>
                      </div>
                      
                      {/* Notification Toggles */}
                      <div className="space-y-3">
                        <label className="block text-gray-300 text-sm font-medium mb-2">Notification Types</label>
                        
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={notifSettings.notify_on_signup}
                            onChange={(e) => setNotifSettings({...notifSettings, notify_on_signup: e.target.checked})}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500"
                          />
                          <span className="text-gray-300">New user signups</span>
                        </label>
                        
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={notifSettings.notify_on_limit_warning}
                            onChange={(e) => setNotifSettings({...notifSettings, notify_on_limit_warning: e.target.checked})}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500"
                          />
                          <span className="text-gray-300">Usage limit warnings</span>
                        </label>
                        
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={notifSettings.notify_on_payment}
                            onChange={(e) => setNotifSettings({...notifSettings, notify_on_payment: e.target.checked})}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500"
                          />
                          <span className="text-gray-300">Payment events</span>
                        </label>
                      </div>
                      
                      {/* Error/Success Messages */}
                      {notifError && (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400">
                          <AlertCircle className="w-4 h-4" />
                          {notifError}
                        </div>
                      )}
                      
                      {notifSuccess && (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2 text-emerald-400">
                          <Check className="w-4 h-4" />
                          {notifSuccess}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-3">
                        <button
                          type="submit"
                          disabled={notifSaving}
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2"
                        >
                          {notifSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                          Save Settings
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => handleTestNotification('email')}
                          disabled={testingNotif}
                          className="px-4 py-2 border border-gray-700 hover:border-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
                        >
                          {testingNotif ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          Send Test Email
                        </button>
                      </div>
                    </form>
                  )}
                </div>
                
                {/* Slack/Discord Webhooks */}
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                  <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-purple-400" />
                    Slack & Discord Webhooks
                  </h2>
                  <p className="text-gray-400 text-sm mb-6">
                    Get instant notifications in Slack or Discord when users sign up.
                  </p>
                  
                  <div className="space-y-4">
                    {/* Slack */}
                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-2">Slack Webhook URL</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="url"
                          value={notifSettings.slack_webhook_url || ''}
                          onChange={(e) => setNotifSettings({...notifSettings, slack_webhook_url: e.target.value})}
                          placeholder="https://hooks.slack.com/services/..."
                          className="flex-1 max-w-lg px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <label className="flex items-center gap-2 text-gray-400">
                          <input
                            type="checkbox"
                            checked={notifSettings.slack_enabled}
                            onChange={(e) => setNotifSettings({...notifSettings, slack_enabled: e.target.checked})}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500"
                          />
                          Enabled
                        </label>
                      </div>
                      {notifSettings.slack_webhook_url && (
                        <button
                          type="button"
                          onClick={() => handleTestNotification('slack')}
                          className="mt-2 text-sm text-purple-400 hover:text-purple-300"
                        >
                          Send Test Message →
                        </button>
                      )}
                    </div>
                    
                    {/* Discord */}
                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-2">Discord Webhook URL</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="url"
                          value={notifSettings.discord_webhook_url || ''}
                          onChange={(e) => setNotifSettings({...notifSettings, discord_webhook_url: e.target.value})}
                          placeholder="https://discord.com/api/webhooks/..."
                          className="flex-1 max-w-lg px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <label className="flex items-center gap-2 text-gray-400">
                          <input
                            type="checkbox"
                            checked={notifSettings.discord_enabled}
                            onChange={(e) => setNotifSettings({...notifSettings, discord_enabled: e.target.checked})}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500"
                          />
                          Enabled
                        </label>
                      </div>
                      {notifSettings.discord_webhook_url && (
                        <button
                          type="button"
                          onClick={() => handleTestNotification('discord')}
                          className="mt-2 text-sm text-purple-400 hover:text-purple-300"
                        >
                          Send Test Message →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* How to get webhook URLs */}
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                  <h3 className="text-blue-400 font-medium mb-2">How to get webhook URLs</h3>
                  <div className="text-gray-400 text-sm space-y-2">
                    <p><strong>Slack:</strong> Go to your Slack workspace → Apps → Incoming Webhooks → Add to Slack → Choose a channel → Copy webhook URL</p>
                    <p><strong>Discord:</strong> Go to your Discord server → Channel settings → Integrations → Webhooks → New Webhook → Copy webhook URL</p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'team' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <TeamPage currentUser={user} />
              </motion.div>
            )}

            {activeTab === 'billing' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <BillingPage />
              </motion.div>
            )}

            {activeTab === 'alerts' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <AlertsPage />
              </motion.div>
            )}

            {activeTab === 'sso' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <SSOPage org={org} />
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;

