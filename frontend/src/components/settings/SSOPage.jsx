import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Plus, Key, Lock, Globe, Check, X,
  Loader2, AlertCircle, Copy, ExternalLink, Settings2, Trash2
} from 'lucide-react';
import * as api from '../../lib/api';

const PROVIDER_LOGOS = {
  saml: '🔐',
  okta: '🟦',
  azure_ad: '🔷',
  google_workspace: '🔵',
  onelogin: '🟣',
  oidc: '🔑',
};

export function SSOPage({ org }) {
  const [configs, setConfigs] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [copied, setCopied] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    provider: '',
    name: '',
    enabled: true,
    enforce: false,
    allowed_domains: '',
    auto_provision: true,
    default_role: 'member',
    saml_config: {
      idp_entity_id: '',
      idp_sso_url: '',
      idp_certificate: '',
    },
    oidc_config: {
      issuer: '',
      client_id: '',
      client_secret: '',
    },
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [configsRes, providersRes] = await Promise.all([
        api.apiRequest('/api/sso/config'),
        api.apiRequest('/api/sso/providers'),
      ]);
      
      setConfigs(configsRes.sso_configs || []);
      setProviders(providersRes.providers || []);
    } catch (err) {
      setError(err.message || 'Failed to load SSO configuration');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateConfig(e) {
    e.preventDefault();
    setError(null);
    
    const payload = {
      provider: formData.provider,
      name: formData.name,
      enabled: formData.enabled,
      enforce: formData.enforce,
      allowed_domains: formData.allowed_domains.split(',').map(d => d.trim()).filter(Boolean),
      auto_provision: formData.auto_provision,
      default_role: formData.default_role,
    };
    
    if (selectedProvider?.type === 'saml') {
      payload.saml_config = formData.saml_config;
    } else {
      payload.oidc_config = formData.oidc_config;
    }
    
    try {
      const res = await api.apiPost('/api/sso/config', payload);
      setSuccess('SSO configuration created successfully');
      setShowModal(false);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to create SSO configuration');
    }
  }

  async function handleDeleteConfig(configId) {
    if (!confirm('Delete this SSO configuration? Users will no longer be able to login via SSO.')) return;
    
    try {
      await api.apiDelete(`/api/sso/config/${configId}`);
      await loadData();
      setSuccess('SSO configuration deleted');
    } catch (err) {
      setError(err.message || 'Failed to delete configuration');
    }
  }

  function copyToClipboard(text, label) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  function selectProvider(provider) {
    setSelectedProvider(provider);
    setFormData({
      ...formData,
      provider: provider.id,
      name: `${provider.name} SSO`,
    });
    setShowModal(true);
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

      {/* Enterprise Badge */}
      <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 rounded-xl p-6 border border-purple-700/50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-purple-500/30 flex items-center justify-center">
            <Shield className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Enterprise Single Sign-On</h2>
            <p className="text-gray-300 mt-1">
              Enable SAML 2.0 or OIDC authentication for your organization
            </p>
          </div>
        </div>
      </div>

      {/* Existing Configurations */}
      {configs.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-white">Active Configurations</h3>
          
          {configs.map((config) => (
            <div key={config.id} className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-3xl">{PROVIDER_LOGOS[config.provider]}</div>
                  <div>
                    <h4 className="text-white font-medium">{config.name}</h4>
                    <p className="text-gray-400 text-sm capitalize">{config.provider.replace('_', ' ')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    config.enabled 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {config.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  {config.enforce && (
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
                      Required
                    </span>
                  )}
                </div>
              </div>
              
              {/* Setup Info */}
              {config.saml && (
                <div className="mt-4 p-4 bg-gray-900/50 rounded-lg space-y-3">
                  <p className="text-gray-400 text-sm font-medium">Configure your Identity Provider with:</p>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-xs">SP Entity ID</p>
                      <p className="text-white text-sm font-mono">{config.saml.sp_entity_id}</p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(config.saml.sp_entity_id, 'sp_entity')}
                      className="text-gray-400 hover:text-white"
                    >
                      {copied === 'sp_entity' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-xs">ACS URL</p>
                      <p className="text-white text-sm font-mono">{config.saml.acs_url}</p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(config.saml.acs_url, 'acs_url')}
                      className="text-gray-400 hover:text-white"
                    >
                      {copied === 'acs_url' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
              
              {config.oidc && (
                <div className="mt-4 p-4 bg-gray-900/50 rounded-lg space-y-3">
                  <p className="text-gray-400 text-sm font-medium">OAuth Configuration:</p>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-xs">Callback URL</p>
                      <p className="text-white text-sm font-mono">{config.oidc.callback_url}</p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(config.oidc.callback_url, 'callback')}
                      className="text-gray-400 hover:text-white"
                    >
                      {copied === 'callback' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
              
              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => handleDeleteConfig(config.id)}
                  className="px-3 py-2 text-gray-400 hover:text-red-400 hover:bg-red-500/20 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Available Providers */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-white">Add SSO Provider</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((provider) => (
            <motion.button
              key={provider.id}
              whileHover={{ scale: 1.02 }}
              onClick={() => selectProvider(provider)}
              className="bg-gray-800/50 rounded-xl p-5 border border-gray-700 hover:border-purple-500/50 text-left transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{PROVIDER_LOGOS[provider.id]}</span>
                <h4 className="text-white font-medium">{provider.name}</h4>
              </div>
              <p className="text-gray-400 text-sm">{provider.description}</p>
              <div className="mt-3 flex items-center gap-2 text-purple-400 text-sm">
                <Plus className="w-4 h-4" />
                Configure
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* SSO Login URL Info */}
      {org?.slug && (
        <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
          <h4 className="text-white font-medium mb-2">SSO Login URL</h4>
          <p className="text-gray-400 text-sm mb-3">
            Share this URL with your team members to login via SSO:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-gray-900 rounded-lg text-green-400 font-mono text-sm">
              https://tracevox.ai/sso/{org.slug}
            </code>
            <button
              onClick={() => copyToClipboard(`https://tracevox.ai/sso/${org.slug}`, 'sso_url')}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              {copied === 'sso_url' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Configuration Modal */}
      <AnimatePresence>
        {showModal && selectedProvider && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-lg max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-700 sticky top-0 bg-gray-800">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="text-2xl">{PROVIDER_LOGOS[selectedProvider.id]}</span>
                  Configure {selectedProvider.name}
                </h3>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleCreateConfig} className="p-4 space-y-4">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">Configuration Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Production SSO"
                    required
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                
                {selectedProvider.type === 'saml' ? (
                  <>
                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-1">IdP Entity ID</label>
                      <input
                        type="text"
                        value={formData.saml_config.idp_entity_id}
                        onChange={(e) => setFormData({
                          ...formData,
                          saml_config: { ...formData.saml_config, idp_entity_id: e.target.value }
                        })}
                        placeholder="https://idp.example.com/metadata"
                        required
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-1">IdP SSO URL</label>
                      <input
                        type="url"
                        value={formData.saml_config.idp_sso_url}
                        onChange={(e) => setFormData({
                          ...formData,
                          saml_config: { ...formData.saml_config, idp_sso_url: e.target.value }
                        })}
                        placeholder="https://idp.example.com/sso"
                        required
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-1">IdP Certificate (PEM)</label>
                      <textarea
                        value={formData.saml_config.idp_certificate}
                        onChange={(e) => setFormData({
                          ...formData,
                          saml_config: { ...formData.saml_config, idp_certificate: e.target.value }
                        })}
                        placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                        required
                        rows={4}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm resize-none"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-1">Issuer URL</label>
                      <input
                        type="url"
                        value={formData.oidc_config.issuer}
                        onChange={(e) => setFormData({
                          ...formData,
                          oidc_config: { ...formData.oidc_config, issuer: e.target.value }
                        })}
                        placeholder="https://accounts.google.com"
                        required
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-1">Client ID</label>
                      <input
                        type="text"
                        value={formData.oidc_config.client_id}
                        onChange={(e) => setFormData({
                          ...formData,
                          oidc_config: { ...formData.oidc_config, client_id: e.target.value }
                        })}
                        placeholder="your-client-id"
                        required
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-1">Client Secret</label>
                      <input
                        type="password"
                        value={formData.oidc_config.client_secret}
                        onChange={(e) => setFormData({
                          ...formData,
                          oidc_config: { ...formData.oidc_config, client_secret: e.target.value }
                        })}
                        placeholder="your-client-secret"
                        required
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </>
                )}
                
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">
                    Allowed Email Domains <span className="text-gray-500">(comma-separated)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.allowed_domains}
                    onChange={(e) => setFormData({ ...formData, allowed_domains: e.target.value })}
                    placeholder="company.com, team.company.com"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-gray-500 text-xs mt-1">Leave empty to allow all domains</p>
                </div>
                
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">Default Role for New Users</label>
                  <select
                    value={formData.default_role}
                    onChange={(e) => setFormData({ ...formData, default_role: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.auto_provision}
                      onChange={(e) => setFormData({ ...formData, auto_provision: e.target.checked })}
                      className="rounded border-gray-600 bg-gray-900 text-purple-500 focus:ring-purple-500"
                    />
                    <span className="text-gray-300">Auto-provision new users on first login</span>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.enforce}
                      onChange={(e) => setFormData({ ...formData, enforce: e.target.checked })}
                      className="rounded border-gray-600 bg-gray-900 text-purple-500 focus:ring-purple-500"
                    />
                    <span className="text-gray-300">Require SSO for all users (disable password login)</span>
                  </label>
                </div>
                
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Shield className="w-4 h-4" />
                    Enable SSO
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

export default SSOPage;

