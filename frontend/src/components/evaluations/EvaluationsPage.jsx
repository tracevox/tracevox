import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  FlaskConical,
  Plus,
  Play,
  Trash2,
  BarChart3,
  FileText,
  Shield,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Copy,
  Star,
} from 'lucide-react';
import api from '../../lib/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Severity color mapping
const getSeverityColor = (score) => {
  if (score >= 0.8) return 'text-emerald-500';
  if (score >= 0.6) return 'text-yellow-500';
  return 'text-red-500';
};

const getScoreBadgeVariant = (score) => {
  if (score >= 0.8) return 'default';
  if (score >= 0.6) return 'secondary';
  return 'destructive';
};

export default function EvaluationsPage({ onBack }) {
  const [templates, setTemplates] = useState([]);
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [runningEval, setRunningEval] = useState(false);
  const [activeTab, setActiveTab] = useState('templates');

  // Run evaluation form
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [context, setContext] = useState('');
  const [evalResult, setEvalResult] = useState(null);

  // Create template dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    description: '',
    prompt: '',
    category: 'custom',
  });

  useEffect(() => {
    fetchTemplates();
    fetchResults();
    fetchSummary();
  }, []);

  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem('tracevox_token');
      const resp = await fetch(`${API_BASE}/api/evaluations/templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      setTemplates(data.templates || []);
    } catch (e) {
      console.error('Failed to fetch templates:', e);
    }
  };

  const fetchResults = async () => {
    try {
      const token = localStorage.getItem('tracevox_token');
      const resp = await fetch(`${API_BASE}/api/evaluations/results?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      setResults(data.results || []);
    } catch (e) {
      console.error('Failed to fetch results:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const token = localStorage.getItem('tracevox_token');
      const resp = await fetch(`${API_BASE}/api/evaluations/scores/summary?days=7`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      setSummary(data);
    } catch (e) {
      console.error('Failed to fetch summary:', e);
    }
  };

  const runEvaluation = async () => {
    if (!selectedTemplate || !inputText || !outputText) return;
    setRunningEval(true);
    setEvalResult(null);

    try {
      const token = localStorage.getItem('tracevox_token');
      const resp = await fetch(`${API_BASE}/api/evaluations/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          template_id: selectedTemplate,
          input_text: inputText,
          output_text: outputText,
          context: context || null,
        }),
      });

      if (!resp.ok) {
        const error = await resp.json();
        throw new Error(error.detail || 'Evaluation failed');
      }

      const data = await resp.json();
      setEvalResult(data);
      fetchResults();
      fetchSummary();
    } catch (e) {
      console.error('Evaluation failed:', e);
      alert(e.message);
    } finally {
      setRunningEval(false);
    }
  };

  const createTemplate = async () => {
    try {
      const token = localStorage.getItem('tracevox_token');
      const resp = await fetch(`${API_BASE}/api/evaluations/templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newTemplate),
      });

      if (!resp.ok) throw new Error('Failed to create template');

      setCreateDialogOpen(false);
      setNewTemplate({ name: '', description: '', prompt: '', category: 'custom' });
      fetchTemplates();
    } catch (e) {
      console.error('Create template failed:', e);
      alert(e.message);
    }
  };

  const deleteTemplate = async (templateId) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const token = localStorage.getItem('tracevox_token');
      await fetch(`${API_BASE}/api/evaluations/templates/${templateId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchTemplates();
    } catch (e) {
      console.error('Delete template failed:', e);
    }
  };

  const qualityTemplates = templates.filter((t) => t.category === 'quality');
  const safetyTemplates = templates.filter((t) => t.category === 'safety');
  const customTemplates = templates.filter((t) => t.category === 'custom' || !t.is_builtin);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <FlaskConical className="h-6 w-6 text-purple-500" />
                Evaluations
              </h1>
              <p className="text-sm text-muted-foreground">
                Model-based evaluation for LLM outputs
              </p>
            </div>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Evaluation Template</DialogTitle>
                <DialogDescription>
                  Create a custom evaluation template for scoring LLM outputs.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Name</Label>
                  <Input
                    placeholder="e.g., Customer Support Quality"
                    value={newTemplate.name}
                    onChange={(e) =>
                      setNewTemplate({ ...newTemplate, name: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Description</Label>
                  <Input
                    placeholder="Brief description of what this template evaluates"
                    value={newTemplate.description}
                    onChange={(e) =>
                      setNewTemplate({ ...newTemplate, description: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Category</Label>
                  <Select
                    value={newTemplate.category}
                    onValueChange={(v) =>
                      setNewTemplate({ ...newTemplate, category: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quality">Quality</SelectItem>
                      <SelectItem value="safety">Safety</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Evaluation Prompt</Label>
                  <Textarea
                    className="min-h-[200px] font-mono text-sm"
                    placeholder={`Evaluate the quality of the response on a scale from 0 to 1.

Input: {input}
Generation: {output}
Context: {context}

Provide your response as JSON:
{"score": <0-1>, "reasoning": "<explanation>"}`}
                    value={newTemplate.prompt}
                    onChange={(e) =>
                      setNewTemplate({ ...newTemplate, prompt: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Use {'{input}'}, {'{output}'}, and {'{context}'} as placeholders.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={createTemplate}>Create Template</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{summary.total_evaluations}</div>
                <div className="text-sm text-muted-foreground">
                  Total Evaluations (7d)
                </div>
              </CardContent>
            </Card>
            {summary.summaries?.slice(0, 3).map((s) => (
              <Card key={s.template_id}>
                <CardContent className="pt-6">
                  <div className={`text-2xl font-bold ${getSeverityColor(s.avg_score)}`}>
                    {(s.avg_score * 100).toFixed(0)}%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {s.template_name} ({s.count})
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="templates" className="gap-2">
              <FileText className="h-4 w-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="run" className="gap-2">
              <Play className="h-4 w-4" />
              Run Evaluation
            </TabsTrigger>
            <TabsTrigger value="results" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Results
            </TabsTrigger>
          </TabsList>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-6">
            {/* Quality Templates */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-emerald-500" />
                  Quality Templates
                </CardTitle>
                <CardDescription>
                  Evaluate response quality, helpfulness, and coherence
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {qualityTemplates.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div>
                        <div className="font-medium">{t.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {t.description}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.is_builtin && <Badge variant="outline">Built-in</Badge>}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedTemplate(t.id);
                            setActiveTab('run');
                          }}
                        >
                          Use
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Safety Templates */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-amber-500" />
                  Safety Templates
                </CardTitle>
                <CardDescription>
                  Detect toxicity, hallucinations, and harmful content
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {safetyTemplates.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div>
                        <div className="font-medium">{t.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {t.description}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.is_builtin && <Badge variant="outline">Built-in</Badge>}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedTemplate(t.id);
                            setActiveTab('run');
                          }}
                        >
                          Use
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Custom Templates */}
            {customTemplates.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-purple-500" />
                    Custom Templates
                  </CardTitle>
                  <CardDescription>Your custom evaluation templates</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {customTemplates.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div>
                          <div className="font-medium">{t.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {t.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedTemplate(t.id);
                              setActiveTab('run');
                            }}
                          >
                            Use
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteTemplate(t.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Run Evaluation Tab */}
          <TabsContent value="run" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Run Evaluation</CardTitle>
                  <CardDescription>
                    Evaluate an LLM output using a template
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Template</Label>
                    <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Input (User Query)</Label>
                    <Textarea
                      placeholder="Enter the user's input/query..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      className="min-h-[80px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Output (LLM Response)</Label>
                    <Textarea
                      placeholder="Enter the LLM's output/response..."
                      value={outputText}
                      onChange={(e) => setOutputText(e.target.value)}
                      className="min-h-[120px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Context (Optional)</Label>
                    <Textarea
                      placeholder="Additional context for hallucination detection..."
                      value={context}
                      onChange={(e) => setContext(e.target.value)}
                      className="min-h-[60px]"
                    />
                  </div>

                  <Button
                    className="w-full gap-2"
                    onClick={runEvaluation}
                    disabled={!selectedTemplate || !inputText || !outputText || runningEval}
                  >
                    {runningEval ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Run Evaluation
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Result</CardTitle>
                  <CardDescription>Evaluation output</CardDescription>
                </CardHeader>
                <CardContent>
                  {evalResult ? (
                    <div className="space-y-4">
                      <div className="text-center py-6">
                        <div
                          className={`text-5xl font-bold ${getSeverityColor(
                            evalResult.score
                          )}`}
                        >
                          {(evalResult.score * 100).toFixed(0)}%
                        </div>
                        <Badge variant={getScoreBadgeVariant(evalResult.score)} className="mt-2">
                          {evalResult.template_name}
                        </Badge>
                      </div>

                      <div className="p-4 rounded-lg bg-muted/50">
                        <Label className="text-xs uppercase text-muted-foreground">
                          Reasoning
                        </Label>
                        <p className="mt-1 text-sm">{evalResult.reasoning}</p>
                      </div>

                      <div className="text-xs text-muted-foreground text-center">
                        Model: {evalResult.model_used} • ID: {evalResult.id}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                      Run an evaluation to see results
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Results Tab */}
          <TabsContent value="results">
            <Card>
              <CardHeader>
                <CardTitle>Evaluation History</CardTitle>
                <CardDescription>Recent evaluation results</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : results.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No evaluations yet. Run an evaluation to see results.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Template</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead className="hidden md:table-cell">Input</TableHead>
                        <TableHead className="hidden lg:table-cell">Reasoning</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <Badge variant="outline">{r.template_name}</Badge>
                          </TableCell>
                          <TableCell>
                            <span
                              className={`font-mono font-bold ${getSeverityColor(
                                r.score
                              )}`}
                            >
                              {(r.score * 100).toFixed(0)}%
                            </span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell max-w-[200px] truncate">
                            {r.input_text}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell max-w-[300px] truncate text-sm text-muted-foreground">
                            {r.reasoning}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(r.created_at).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

