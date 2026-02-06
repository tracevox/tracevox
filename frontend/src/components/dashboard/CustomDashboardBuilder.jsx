import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Plus, Trash2, Settings2, Copy, Share2,
  GripVertical, BarChart3, LineChart, PieChart, Hash, Table,
  Loader2, AlertCircle, Check, X, Save, Eye, Edit2, ArrowLeft
} from 'lucide-react';
import * as api from '../../lib/api';

const WIDGET_ICONS = {
  line_chart: LineChart,
  bar_chart: BarChart3,
  pie_chart: PieChart,
  area_chart: LineChart,
  stat_card: Hash,
  table: Table,
  heatmap: LayoutDashboard,
  gauge: Hash,
  text: Edit2,
  log_stream: Table,
};

export function CustomDashboardBuilder({ onBack }) {
  const [dashboards, setDashboards] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [widgetTypes, setWidgetTypes] = useState({ widget_types: [], metrics: [], time_ranges: [] });
  const [selectedDashboard, setSelectedDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [editingWidget, setEditingWidget] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [dashboardsRes, templatesRes, typesRes] = await Promise.all([
        api.apiRequest('/api/dashboards'),
        api.apiRequest('/api/dashboards/templates'),
        api.apiRequest('/api/dashboards/widget-types'),
      ]);
      
      setDashboards(dashboardsRes.dashboards || []);
      setTemplates(templatesRes.templates || []);
      setWidgetTypes(typesRes);
    } catch (err) {
      setError(err.message || 'Failed to load dashboards');
    } finally {
      setLoading(false);
    }
  }

  async function loadDashboard(id) {
    try {
      const res = await api.apiRequest(`/api/dashboards/${id}`);
      setSelectedDashboard(res);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard');
    }
  }

  async function handleCreateDashboard(e) {
    e.preventDefault();
    setSaving(true);
    
    try {
      let res;
      if (selectedTemplate) {
        res = await api.apiPost(`/api/dashboards/from-template/${selectedTemplate}?name=${encodeURIComponent(newDashboardName)}`);
      } else {
        res = await api.apiPost('/api/dashboards', {
          name: newDashboardName,
          widgets: [],
        });
      }
      
      setSuccess('Dashboard created!');
      setShowNewModal(false);
      setNewDashboardName('');
      setSelectedTemplate(null);
      await loadData();
      
      if (res.dashboard_id) {
        await loadDashboard(res.dashboard_id);
      }
    } catch (err) {
      setError(err.message || 'Failed to create dashboard');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDashboard() {
    if (!selectedDashboard) return;
    setSaving(true);
    
    try {
      await api.apiPatch(`/api/dashboards/${selectedDashboard.id}`, {
        name: selectedDashboard.name,
        widgets: selectedDashboard.widgets,
      });
      setSuccess('Dashboard saved!');
    } catch (err) {
      setError(err.message || 'Failed to save dashboard');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDashboard(id) {
    if (!confirm('Delete this dashboard?')) return;
    
    try {
      await api.apiDelete(`/api/dashboards/${id}`);
      if (selectedDashboard?.id === id) {
        setSelectedDashboard(null);
      }
      await loadData();
      setSuccess('Dashboard deleted');
    } catch (err) {
      setError(err.message || 'Failed to delete dashboard');
    }
  }

  async function handleDuplicateDashboard(id) {
    try {
      await api.apiPost(`/api/dashboards/${id}/duplicate`);
      await loadData();
      setSuccess('Dashboard duplicated');
    } catch (err) {
      setError(err.message || 'Failed to duplicate dashboard');
    }
  }

  function addWidget(type) {
    if (!selectedDashboard) return;
    
    const newWidget = {
      id: `w${Date.now()}`,
      type: type.id,
      title: `New ${type.name}`,
      metric: widgetTypes.metrics[0]?.id || 'requests',
      time_range: '24h',
      x: 0,
      y: selectedDashboard.widgets.length * 2,
      width: 4,
      height: 2,
      settings: {},
    };
    
    setSelectedDashboard({
      ...selectedDashboard,
      widgets: [...selectedDashboard.widgets, newWidget],
    });
  }

  function updateWidget(widgetId, updates) {
    if (!selectedDashboard) return;
    
    setSelectedDashboard({
      ...selectedDashboard,
      widgets: selectedDashboard.widgets.map(w =>
        w.id === widgetId ? { ...w, ...updates } : w
      ),
    });
  }

  function removeWidget(widgetId) {
    if (!selectedDashboard) return;
    
    setSelectedDashboard({
      ...selectedDashboard,
      widgets: selectedDashboard.widgets.filter(w => w.id !== widgetId),
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
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
              <h1 className="text-xl font-semibold text-white flex items-center gap-2">
                <LayoutDashboard className="w-5 h-5 text-purple-400" />
                Custom Dashboards
              </h1>
            </div>
            
            <div className="flex items-center gap-3">
              {selectedDashboard && (
                <button
                  onClick={handleSaveDashboard}
                  disabled={saving}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </button>
              )}
              <button
                onClick={() => setShowNewModal(true)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Dashboard
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Notifications */}
      <AnimatePresence>
        {(success || error) && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
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
                <button onClick={() => setSuccess(null)} className="text-green-400">
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
                <button onClick={() => setError(null)} className="text-red-400">
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar - Dashboard List */}
          <div className="w-80 flex-shrink-0 space-y-6">
            {/* My Dashboards */}
            <div>
              <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
                My Dashboards
              </h3>
              <div className="space-y-2">
                {dashboards.map((dashboard) => (
                  <div
                    key={dashboard.id}
                    className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedDashboard?.id === dashboard.id
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-800/50 text-gray-300 hover:bg-gray-800'
                    }`}
                    onClick={() => loadDashboard(dashboard.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{dashboard.name}</span>
                      {dashboard.is_default && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDuplicateDashboard(dashboard.id); }}
                        className="p-1 hover:bg-white/10 rounded"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteDashboard(dashboard.id); }}
                        className="p-1 hover:bg-red-500/20 rounded text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                
                {dashboards.length === 0 && (
                  <p className="text-gray-500 text-sm text-center py-4">
                    No dashboards yet
                  </p>
                )}
              </div>
            </div>

            {/* Templates */}
            <div>
              <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
                Templates
              </h3>
              <div className="space-y-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => {
                      setSelectedTemplate(template.id);
                      setNewDashboardName(template.name);
                      setShowNewModal(true);
                    }}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-800/30 text-gray-400 hover:bg-gray-800/50 hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <LayoutDashboard className="w-4 h-4" />
                      <span>{template.name}</span>
                    </div>
                    <Plus className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content - Dashboard Editor */}
          <div className="flex-1 min-w-0">
            {selectedDashboard ? (
              <div className="space-y-6">
                {/* Dashboard Header */}
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={selectedDashboard.name}
                    onChange={(e) => setSelectedDashboard({ ...selectedDashboard, name: e.target.value })}
                    className="text-2xl font-bold text-white bg-transparent border-b border-transparent hover:border-gray-600 focus:border-purple-500 focus:outline-none px-1"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm">
                      {selectedDashboard.widgets.length} widgets
                    </span>
                  </div>
                </div>

                {/* Widget Palette */}
                <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                  <p className="text-gray-400 text-sm mb-3">Add Widget</p>
                  <div className="flex flex-wrap gap-2">
                    {widgetTypes.widget_types?.map((type) => {
                      const Icon = WIDGET_ICONS[type.id] || Hash;
                      return (
                        <button
                          key={type.id}
                          onClick={() => addWidget(type)}
                          className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
                        >
                          <Icon className="w-4 h-4" />
                          {type.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Widget Grid */}
                <div className="space-y-4">
                  {selectedDashboard.widgets.map((widget) => {
                    const Icon = WIDGET_ICONS[widget.type] || Hash;
                    
                    return (
                      <div
                        key={widget.id}
                        className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden"
                      >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-900/50">
                          <div className="flex items-center gap-3">
                            <GripVertical className="w-4 h-4 text-gray-500 cursor-move" />
                            <Icon className="w-4 h-4 text-purple-400" />
                            <input
                              type="text"
                              value={widget.title}
                              onChange={(e) => updateWidget(widget.id, { title: e.target.value })}
                              className="bg-transparent text-white font-medium focus:outline-none border-b border-transparent focus:border-purple-500"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setEditingWidget(editingWidget === widget.id ? null : widget.id)}
                              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                            >
                              <Settings2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => removeWidget(widget.id)}
                              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/20 rounded transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        
                        {/* Widget Settings (expandable) */}
                        <AnimatePresence>
                          {editingWidget === widget.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="p-4 space-y-4 bg-gray-900/30">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-gray-400 text-sm mb-1">Metric</label>
                                    <select
                                      value={widget.metric || ''}
                                      onChange={(e) => updateWidget(widget.id, { metric: e.target.value })}
                                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    >
                                      {widgetTypes.metrics?.map((m) => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-gray-400 text-sm mb-1">Time Range</label>
                                    <select
                                      value={widget.time_range || '24h'}
                                      onChange={(e) => updateWidget(widget.id, { time_range: e.target.value })}
                                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    >
                                      {widgetTypes.time_ranges?.map((t) => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-4 gap-4">
                                  <div>
                                    <label className="block text-gray-400 text-sm mb-1">X</label>
                                    <input
                                      type="number"
                                      value={widget.x}
                                      onChange={(e) => updateWidget(widget.id, { x: parseInt(e.target.value) })}
                                      min={0}
                                      max={11}
                                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-gray-400 text-sm mb-1">Y</label>
                                    <input
                                      type="number"
                                      value={widget.y}
                                      onChange={(e) => updateWidget(widget.id, { y: parseInt(e.target.value) })}
                                      min={0}
                                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-gray-400 text-sm mb-1">Width</label>
                                    <input
                                      type="number"
                                      value={widget.width}
                                      onChange={(e) => updateWidget(widget.id, { width: parseInt(e.target.value) })}
                                      min={1}
                                      max={12}
                                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-gray-400 text-sm mb-1">Height</label>
                                    <input
                                      type="number"
                                      value={widget.height}
                                      onChange={(e) => updateWidget(widget.id, { height: parseInt(e.target.value) })}
                                      min={1}
                                      max={8}
                                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        
                        {/* Widget Preview */}
                        <div className="p-8 flex items-center justify-center text-gray-500">
                          <div className="text-center">
                            <Icon className="w-12 h-12 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">Widget Preview</p>
                            <p className="text-xs text-gray-600">{widget.type} • {widget.metric}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {selectedDashboard.widgets.length === 0 && (
                    <div className="text-center py-16 bg-gray-800/30 rounded-xl border border-gray-700 border-dashed">
                      <LayoutDashboard className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400">No widgets yet</p>
                      <p className="text-gray-500 text-sm mt-1">Add widgets from the palette above</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-24">
                <LayoutDashboard className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-white mb-2">Custom Dashboards</h2>
                <p className="text-gray-400 max-w-md mx-auto">
                  Create personalized dashboards with the metrics that matter most to you.
                  Select a dashboard from the sidebar or create a new one.
                </p>
                <button
                  onClick={() => setShowNewModal(true)}
                  className="mt-6 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors inline-flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Create Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Dashboard Modal */}
      <AnimatePresence>
        {showNewModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowNewModal(false)}
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
                  <LayoutDashboard className="w-5 h-5 text-purple-400" />
                  {selectedTemplate ? 'Create from Template' : 'New Dashboard'}
                </h3>
                <button onClick={() => { setShowNewModal(false); setSelectedTemplate(null); }} className="text-gray-400 hover:text-white p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleCreateDashboard} className="p-4 space-y-4">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">Dashboard Name</label>
                  <input
                    type="text"
                    value={newDashboardName}
                    onChange={(e) => setNewDashboardName(e.target.value)}
                    placeholder="My Custom Dashboard"
                    required
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                
                {selectedTemplate && (
                  <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                    <p className="text-purple-300 text-sm">
                      Creating from template: <strong>{templates.find(t => t.id === selectedTemplate)?.name}</strong>
                    </p>
                  </div>
                )}
                
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowNewModal(false); setSelectedTemplate(null); }}
                    className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Create
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

export default CustomDashboardBuilder;

