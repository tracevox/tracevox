import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, Plus, Slack, AlertTriangle, Mail, Webhook,
  MoreHorizontal, Trash2, Send, Clock, X, Check,
  Loader2, AlertCircle, Settings2, Play, Pause, Zap
} from 'lucide-react';
import * as api from '../../lib/api';

const CHANNEL_ICONS = {
  slack: Slack,
  pagerduty: AlertTriangle,
  email: Mail,
  webhook: Webhook,
};

const CHANNEL_COLORS = {
  slack: 'bg-[#4A154B] text-white',
  pagerduty: 'bg-[#06AC38] text-white',
  email: 'bg-blue-600 text-white',
  webhook: 'bg-orange-600 text-white',
};

const SEVERITY_COLORS = {
  critical: 'bg-red-500/20 text-red-400',
  high: 'bg-orange-500/20 text-orange-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  low: 'bg-green-500/20 text-green-400',
  info: 'bg-blue-500/20 text-blue-400',
};

export function AlertsPage() {
  const [integrations, setIntegrations] = useState([]);
  const [rules, setRules] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('integrations');
  const [showModal, setShowModal] = useState(null); // 'integration' | 'rule'
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [testing, setTesting] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    channel: 'slack',
    enabled: true,
    config: {},
  });

  const [ruleData, setRuleData] = useState({
    name: '',
    description: '',
    condition: 'error_rate',
    threshold: 5,
    comparison: 'gt',
    window_minutes: 5,
    severity: 'medium',
    integrations: [],
    enabled: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [integrationsRes, rulesRes, historyRes] = await Promise.all([
        api.apiRequest('/api/alerts/integrations'),
        api.apiRequest('/api/alerts/rules'),
        api.apiRequest('/api/alerts/history'),
      ]);
      
      setIntegrations(integrationsRes.integrations || []);
      setRules(rulesRes.rules || []);
      setHistory(historyRes.alerts || []);
    } catch (err) {
      setError(err.message || 'Failed to load alerts data');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateIntegration(e) {
    e.preventDefault();
    setError(null);
    
    try {
      await api.apiPost('/api/alerts/integrations', formData);
      setSuccess('Integration created successfully');
      setShowModal(null);
      setFormData({ name: '', channel: 'slack', enabled: true, config: {} });
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to create integration');
    }
  }

  async function handleTestIntegration(id) {
    setTesting(id);
    try {
      await api.apiPost(`/api/alerts/integrations/${id}/test`);
      setSuccess('Test alert sent successfully');
    } catch (err) {
      setError(err.message || 'Failed to send test alert');
    } finally {
      setTesting(null);
    }
  }

  async function handleDeleteIntegration(id) {
    if (!confirm('Delete this integration?')) return;
    
    try {
      await api.apiDelete(`/api/alerts/integrations/${id}`);
      await loadData();
      setSuccess('Integration deleted');
    } catch (err) {
      setError(err.message || 'Failed to delete integration');
    }
  }

  async function handleCreateRule(e) {
    e.preventDefault();
    setError(null);
    
    try {
      await api.apiPost('/api/alerts/rules', ruleData);
      setSuccess('Alert rule created');
      setShowModal(null);
      setRuleData({
        name: '',
        description: '',
        condition: 'error_rate',
        threshold: 5,
        comparison: 'gt',
        window_minutes: 5,
        severity: 'medium',
        integrations: [],
        enabled: true,
      });
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to create rule');
    }
  }

  async function handleDeleteRule(id) {
    if (!confirm('Delete this rule?')) return;
    
    try {
      await api.apiDelete(`/api/alerts/rules/${id}`);
      await loadData();
      setSuccess('Rule deleted');
    } catch (err) {
      setError(err.message || 'Failed to delete rule');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notifications */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-green-500/20 border border-green-500 rounded-lg p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Check className="w-5 h-5 text-green-400" />
              <span className="text-green-400">{success}</span>
            </div>
            <button onClick={() => setSuccess(null)} className="text-green-400 hover:text-green-300">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
        
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-red-500/20 border border-red-500 rounded-lg p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <span className="text-red-400">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-gray-700">
        {['integrations', 'rules', 'history'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 px-1 font-medium transition-colors capitalize ${
              activeTab === tab
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Integrations Tab */}
      {activeTab === 'integrations' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-gray-400">
              Connect your alerting tools to receive notifications
            </p>
            <button
              onClick={() => setShowModal('integration')}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Integration
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrations.map((integration) => {
              const Icon = CHANNEL_ICONS[integration.channel] || Bell;
              
              return (
                <div key={integration.id} className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${CHANNEL_COLORS[integration.channel]}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-white font-medium">{integration.name}</h3>
                        <p className="text-gray-400 text-sm capitalize">{integration.channel}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      integration.enabled 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {integration.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => handleTestIntegration(integration.id)}
                      disabled={testing === integration.id}
                      className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      {testing === integration.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Test
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteIntegration(integration.id)}
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
            
            {integrations.length === 0 && (
              <div className="col-span-full text-center py-12 bg-gray-800/30 rounded-xl border border-gray-700 border-dashed">
                <Bell className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">No integrations configured</p>
                <button
                  onClick={() => setShowModal('integration')}
                  className="mt-4 text-purple-400 hover:text-purple-300"
                >
                  Add your first integration
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-gray-400">
              Define conditions that trigger alerts
            </p>
            <button
              onClick={() => setShowModal('rule')}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Rule
            </button>
          </div>

          <div className="space-y-3">
            {rules.map((rule) => (
              <div key={rule.id} className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    rule.enabled ? 'bg-purple-500/20' : 'bg-gray-700'
                  }`}>
                    <Zap className={`w-5 h-5 ${rule.enabled ? 'text-purple-400' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <h3 className="text-white font-medium">{rule.name}</h3>
                    <p className="text-gray-400 text-sm">
                      {rule.condition} {rule.comparison === 'gt' ? '>' : '<'} {rule.threshold}
                      {' '} ({rule.window_minutes}m window)
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${SEVERITY_COLORS[rule.severity]}`}>
                    {rule.severity}
                  </span>
                  <span className="text-gray-500 text-sm">
                    {rule.trigger_count || 0} triggers
                  </span>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            
            {rules.length === 0 && (
              <div className="text-center py-12 bg-gray-800/30 rounded-xl border border-gray-700 border-dashed">
                <Zap className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">No alert rules configured</p>
                <button
                  onClick={() => setShowModal('rule')}
                  className="mt-4 text-purple-400 hover:text-purple-300"
                >
                  Create your first rule
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {history.map((alert) => (
            <div key={alert.id} className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-2 h-2 rounded-full ${
                  alert.severity === 'critical' ? 'bg-red-500' :
                  alert.severity === 'high' ? 'bg-orange-500' :
                  alert.severity === 'medium' ? 'bg-yellow-500' :
                  'bg-green-500'
                }`} />
                <div>
                  <h3 className="text-white font-medium">{alert.title}</h3>
                  <p className="text-gray-400 text-sm">{alert.description}</p>
                </div>
              </div>
              <div className="text-right">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${SEVERITY_COLORS[alert.severity]}`}>
                  {alert.severity}
                </span>
                <p className="text-gray-500 text-xs mt-1">
                  {alert.triggered_at && new Date(alert.triggered_at).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
          
          {history.length === 0 && (
            <div className="text-center py-12 bg-gray-800/30 rounded-xl border border-gray-700 border-dashed">
              <Clock className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No alerts triggered yet</p>
            </div>
          )}
        </div>
      )}

      {/* Create Integration Modal */}
      <AnimatePresence>
        {showModal === 'integration' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-700">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-purple-400" />
                  Add Integration
                </h3>
                <button onClick={() => setShowModal(null)} className="text-gray-400 hover:text-white p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleCreateIntegration} className="p-4 space-y-4">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Production Alerts"
                    required
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">Channel</label>
                  <select
                    value={formData.channel}
                    onChange={(e) => setFormData({ ...formData, channel: e.target.value, config: {} })}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="slack">Slack</option>
                    <option value="pagerduty">PagerDuty</option>
                    <option value="email">Email</option>
                    <option value="webhook">Custom Webhook</option>
                  </select>
                </div>
                
                {formData.channel === 'slack' && (
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-1">Webhook URL</label>
                    <input
                      type="url"
                      value={formData.config.webhook_url || ''}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        config: { ...formData.config, webhook_url: e.target.value }
                      })}
                      placeholder="https://hooks.slack.com/services/..."
                      required
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                )}
                
                {formData.channel === 'pagerduty' && (
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-1">Routing Key</label>
                    <input
                      type="text"
                      value={formData.config.routing_key || ''}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        config: { ...formData.config, routing_key: e.target.value }
                      })}
                      placeholder="Events API v2 routing key"
                      required
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                )}
                
                {formData.channel === 'email' && (
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-1">Recipients (comma-separated)</label>
                    <input
                      type="text"
                      value={(formData.config.recipients || []).join(', ')}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        config: { ...formData.config, recipients: e.target.value.split(',').map(s => s.trim()) }
                      })}
                      placeholder="alerts@company.com, team@company.com"
                      required
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                )}
                
                {formData.channel === 'webhook' && (
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-1">Webhook URL</label>
                    <input
                      type="url"
                      value={formData.config.url || ''}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        config: { ...formData.config, url: e.target.value }
                      })}
                      placeholder="https://your-webhook.com/endpoint"
                      required
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                )}
                
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(null)}
                    className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                  >
                    Create
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Rule Modal */}
      <AnimatePresence>
        {showModal === 'rule' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-700 sticky top-0 bg-gray-800">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-purple-400" />
                  Create Alert Rule
                </h3>
                <button onClick={() => setShowModal(null)} className="text-gray-400 hover:text-white p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleCreateRule} className="p-4 space-y-4">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">Rule Name</label>
                  <input
                    type="text"
                    value={ruleData.name}
                    onChange={(e) => setRuleData({ ...ruleData, name: e.target.value })}
                    placeholder="High Error Rate"
                    required
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">Condition</label>
                  <select
                    value={ruleData.condition}
                    onChange={(e) => setRuleData({ ...ruleData, condition: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="error_rate">Error Rate (%)</option>
                    <option value="latency_p95">P95 Latency (ms)</option>
                    <option value="latency_avg">Avg Latency (ms)</option>
                    <option value="cost_threshold">Cost ($)</option>
                    <option value="request_volume">Request Volume</option>
                    <option value="block_rate">Block Rate (%)</option>
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-1">Comparison</label>
                    <select
                      value={ruleData.comparison}
                      onChange={(e) => setRuleData({ ...ruleData, comparison: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="gt">Greater than</option>
                      <option value="gte">Greater or equal</option>
                      <option value="lt">Less than</option>
                      <option value="lte">Less or equal</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-1">Threshold</label>
                    <input
                      type="number"
                      value={ruleData.threshold}
                      onChange={(e) => setRuleData({ ...ruleData, threshold: parseFloat(e.target.value) })}
                      required
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-1">Window (minutes)</label>
                    <input
                      type="number"
                      value={ruleData.window_minutes}
                      onChange={(e) => setRuleData({ ...ruleData, window_minutes: parseInt(e.target.value) })}
                      min={1}
                      max={60}
                      required
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-1">Severity</label>
                    <select
                      value={ruleData.severity}
                      onChange={(e) => setRuleData({ ...ruleData, severity: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                      <option value="info">Info</option>
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">Notify Integrations</label>
                  <div className="space-y-2">
                    {integrations.map((int) => (
                      <label key={int.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ruleData.integrations.includes(int.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setRuleData({ ...ruleData, integrations: [...ruleData.integrations, int.id] });
                            } else {
                              setRuleData({ 
                                ...ruleData, 
                                integrations: ruleData.integrations.filter(id => id !== int.id) 
                              });
                            }
                          }}
                          className="rounded border-gray-600 bg-gray-900 text-purple-500 focus:ring-purple-500"
                        />
                        <span className="text-gray-300">{int.name}</span>
                        <span className="text-gray-500 text-sm">({int.channel})</span>
                      </label>
                    ))}
                    {integrations.length === 0 && (
                      <p className="text-gray-500 text-sm">No integrations configured. Add one first.</p>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(null)}
                    className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                  >
                    Create Rule
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AlertsPage;

