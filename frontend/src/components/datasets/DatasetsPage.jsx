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
import { Progress } from '@/components/ui/progress';
import {
  ArrowLeft,
  Database,
  Plus,
  Play,
  Trash2,
  Upload,
  FileText,
  Eye,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  ChevronRight,
  BarChart3,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function DatasetsPage({ onBack }) {
  const [datasets, setDatasets] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('datasets');
  
  // Selected dataset for detail view
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [datasetItems, setDatasetItems] = useState([]);
  const [datasetRuns, setDatasetRuns] = useState([]);
  
  // Create dataset dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newDataset, setNewDataset] = useState({
    name: '',
    description: '',
  });
  
  // Add item dialog
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    input: '',
    expected_output: '',
    context: '',
  });
  
  // Run dialog
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runConfig, setRunConfig] = useState({
    prompt_template: '{input}',
    model: 'gemini-2.0-flash',
    evaluation_templates: ['relevance', 'conciseness'],
  });
  const [runningTest, setRunningTest] = useState(false);
  
  // Selected run for detail view
  const [selectedRun, setSelectedRun] = useState(null);

  useEffect(() => {
    fetchDatasets();
    fetchRuns();
  }, []);

  const fetchDatasets = async () => {
    try {
      const token = localStorage.getItem('tracevox_token');
      const resp = await fetch(`${API_BASE}/api/datasets?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      setDatasets(data.datasets || []);
    } catch (e) {
      console.error('Failed to fetch datasets:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchRuns = async () => {
    try {
      const token = localStorage.getItem('tracevox_token');
      const resp = await fetch(`${API_BASE}/api/datasets/runs?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      setRuns(data.runs || []);
    } catch (e) {
      console.error('Failed to fetch runs:', e);
    }
  };

  const fetchDatasetDetail = async (datasetId) => {
    try {
      const token = localStorage.getItem('tracevox_token');
      const resp = await fetch(`${API_BASE}/api/datasets/${datasetId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      setSelectedDataset(data);
      setDatasetItems(data.items || []);
      
      // Fetch runs for this dataset
      const runsResp = await fetch(`${API_BASE}/api/datasets/${datasetId}/runs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const runsData = await runsResp.json();
      setDatasetRuns(runsData.runs || []);
    } catch (e) {
      console.error('Failed to fetch dataset detail:', e);
    }
  };

  const createDataset = async () => {
    try {
      const token = localStorage.getItem('tracevox_token');
      const resp = await fetch(`${API_BASE}/api/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newDataset),
      });
      
      if (!resp.ok) throw new Error('Failed to create dataset');
      
      setCreateDialogOpen(false);
      setNewDataset({ name: '', description: '' });
      fetchDatasets();
    } catch (e) {
      console.error('Create dataset failed:', e);
      alert(e.message);
    }
  };

  const deleteDataset = async (datasetId) => {
    if (!confirm('Are you sure you want to delete this dataset?')) return;
    
    try {
      const token = localStorage.getItem('tracevox_token');
      await fetch(`${API_BASE}/api/datasets/${datasetId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchDatasets();
      if (selectedDataset?.id === datasetId) {
        setSelectedDataset(null);
      }
    } catch (e) {
      console.error('Delete dataset failed:', e);
    }
  };

  const addItem = async () => {
    if (!selectedDataset) return;
    
    try {
      const token = localStorage.getItem('tracevox_token');
      const resp = await fetch(`${API_BASE}/api/datasets/${selectedDataset.id}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newItem),
      });
      
      if (!resp.ok) throw new Error('Failed to add item');
      
      setAddItemDialogOpen(false);
      setNewItem({ input: '', expected_output: '', context: '' });
      fetchDatasetDetail(selectedDataset.id);
    } catch (e) {
      console.error('Add item failed:', e);
      alert(e.message);
    }
  };

  const deleteItem = async (itemId) => {
    if (!selectedDataset) return;
    
    try {
      const token = localStorage.getItem('tracevox_token');
      await fetch(`${API_BASE}/api/datasets/${selectedDataset.id}/items/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchDatasetDetail(selectedDataset.id);
    } catch (e) {
      console.error('Delete item failed:', e);
    }
  };

  const runDataset = async () => {
    if (!selectedDataset) return;
    setRunningTest(true);
    
    try {
      const token = localStorage.getItem('tracevox_token');
      const resp = await fetch(`${API_BASE}/api/datasets/${selectedDataset.id}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(runConfig),
      });
      
      if (!resp.ok) {
        const error = await resp.json();
        throw new Error(error.detail || 'Run failed');
      }
      
      const data = await resp.json();
      setSelectedRun(data);
      setRunDialogOpen(false);
      fetchDatasetDetail(selectedDataset.id);
      fetchRuns();
    } catch (e) {
      console.error('Run failed:', e);
      alert(e.message);
    } finally {
      setRunningTest(false);
    }
  };

  const fetchRunDetail = async (runId) => {
    try {
      const token = localStorage.getItem('tracevox_token');
      const resp = await fetch(`${API_BASE}/api/datasets/runs/${runId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      setSelectedRun(data);
    } catch (e) {
      console.error('Failed to fetch run detail:', e);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getScoreColor = (score) => {
    if (score >= 0.8) return 'text-emerald-500';
    if (score >= 0.6) return 'text-yellow-500';
    return 'text-red-500';
  };

  // Dataset detail view
  if (selectedDataset && !selectedRun) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setSelectedDataset(null)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{selectedDataset.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {selectedDataset.description || 'No description'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Dialog open={addItemDialogOpen} onOpenChange={setAddItemDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Item
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Dataset Item</DialogTitle>
                    <DialogDescription>
                      Add a new test case to this dataset.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label>Input (Query)</Label>
                      <Textarea
                        placeholder="Enter the test input/query..."
                        value={newItem.input}
                        onChange={(e) => setNewItem({ ...newItem, input: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Expected Output (Optional)</Label>
                      <Textarea
                        placeholder="Enter the expected response..."
                        value={newItem.expected_output}
                        onChange={(e) => setNewItem({ ...newItem, expected_output: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Context (Optional)</Label>
                      <Textarea
                        placeholder="Additional context for the test..."
                        value={newItem.context}
                        onChange={(e) => setNewItem({ ...newItem, context: e.target.value })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAddItemDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={addItem} disabled={!newItem.input}>
                      Add Item
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              
              <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2" disabled={datasetItems.length === 0}>
                    <Play className="h-4 w-4" />
                    Run Tests
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Run Dataset Tests</DialogTitle>
                    <DialogDescription>
                      Configure and run tests against this dataset.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label>Model</Label>
                      <Select
                        value={runConfig.model}
                        onValueChange={(v) => setRunConfig({ ...runConfig, model: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gemini-2.0-flash">Gemini 2.0 Flash</SelectItem>
                          <SelectItem value="gemini-1.5-pro">Gemini 1.5 Pro</SelectItem>
                          <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Prompt Template</Label>
                      <Textarea
                        className="font-mono text-sm"
                        value={runConfig.prompt_template}
                        onChange={(e) => setRunConfig({ ...runConfig, prompt_template: e.target.value })}
                        placeholder="{input}"
                      />
                      <p className="text-xs text-muted-foreground">
                        Use {'{input}'} and {'{context}'} as placeholders.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label>Evaluation Templates</Label>
                      <div className="flex flex-wrap gap-2">
                        {['relevance', 'conciseness', 'helpfulness', 'toxicity', 'hallucination'].map((t) => (
                          <Badge
                            key={t}
                            variant={runConfig.evaluation_templates.includes(t) ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => {
                              const templates = runConfig.evaluation_templates.includes(t)
                                ? runConfig.evaluation_templates.filter((x) => x !== t)
                                : [...runConfig.evaluation_templates, t];
                              setRunConfig({ ...runConfig, evaluation_templates: templates });
                            }}
                          >
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setRunDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={runDataset} disabled={runningTest}>
                      {runningTest ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Run Tests
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{selectedDataset.item_count || datasetItems.length}</div>
                <div className="text-sm text-muted-foreground">Test Cases</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{datasetRuns.length}</div>
                <div className="text-sm text-muted-foreground">Total Runs</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {datasetRuns.length > 0 && datasetRuns[0].summary?.avg_score !== undefined
                    ? `${(datasetRuns[0].summary.avg_score * 100).toFixed(0)}%`
                    : '-'}
                </div>
                <div className="text-sm text-muted-foreground">Last Avg Score</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="items">
            <TabsList>
              <TabsTrigger value="items" className="gap-2">
                <FileText className="h-4 w-4" />
                Items ({datasetItems.length})
              </TabsTrigger>
              <TabsTrigger value="runs" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Runs ({datasetRuns.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="items">
              <Card>
                <CardContent className="pt-6">
                  {datasetItems.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No items in this dataset yet.</p>
                      <p className="text-sm">Add items to start testing.</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Input</TableHead>
                          <TableHead>Expected Output</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead className="w-[80px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {datasetItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="max-w-[300px] truncate font-mono text-sm">
                              {item.input}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                              {item.expected_output || '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{item.source}</Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteItem(item.id)}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="runs">
              <Card>
                <CardContent className="pt-6">
                  {datasetRuns.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Play className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No test runs yet.</p>
                      <p className="text-sm">Run tests to see results.</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead>Items</TableHead>
                          <TableHead>Avg Score</TableHead>
                          <TableHead>Model</TableHead>
                          <TableHead>Started</TableHead>
                          <TableHead className="w-[80px]">View</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {datasetRuns.map((run) => (
                          <TableRow key={run.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getStatusIcon(run.status)}
                                <span className="capitalize">{run.status}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {run.completed_items}/{run.total_items}
                            </TableCell>
                            <TableCell>
                              {run.summary?.avg_score !== undefined ? (
                                <span className={getScoreColor(run.summary.avg_score)}>
                                  {(run.summary.avg_score * 100).toFixed(0)}%
                                </span>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{run.model}</Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(run.started_at).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => fetchRunDetail(run.id)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
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

  // Run detail view
  if (selectedRun) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setSelectedRun(null)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Test Run Results</h1>
              <p className="text-sm text-muted-foreground">
                {selectedRun.dataset_name} • {selectedRun.model}
              </p>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  {getStatusIcon(selectedRun.status)}
                  <span className="text-lg font-semibold capitalize">{selectedRun.status}</span>
                </div>
                <div className="text-sm text-muted-foreground">Status</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className={`text-2xl font-bold ${getScoreColor(selectedRun.summary?.avg_score || 0)}`}>
                  {selectedRun.summary?.avg_score !== undefined
                    ? `${(selectedRun.summary.avg_score * 100).toFixed(0)}%`
                    : '-'}
                </div>
                <div className="text-sm text-muted-foreground">Average Score</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {selectedRun.completed_items}/{selectedRun.total_items}
                </div>
                <div className="text-sm text-muted-foreground">Items Tested</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {selectedRun.summary?.evaluations_run || 0}
                </div>
                <div className="text-sm text-muted-foreground">Evaluations</div>
              </CardContent>
            </Card>
          </div>

          {/* Results Table */}
          <Card>
            <CardHeader>
              <CardTitle>Test Results</CardTitle>
              <CardDescription>Individual test case results</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedRun.results?.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Input</TableHead>
                      <TableHead>Output</TableHead>
                      <TableHead>Scores</TableHead>
                      <TableHead>Avg Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedRun.results.map((result, i) => (
                      <TableRow key={i}>
                        <TableCell className="max-w-[200px] truncate font-mono text-sm">
                          {result.input}
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate text-sm">
                          {result.output}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(result.scores || {}).map(([key, val]) => (
                              <Badge key={key} variant="outline" className="text-xs">
                                {key}: {(val * 100).toFixed(0)}%
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`font-bold ${getScoreColor(result.avg_score)}`}>
                            {(result.avg_score * 100).toFixed(0)}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No results available
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Main datasets list view
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
                <Database className="h-6 w-6 text-purple-500" />
                Datasets & Testing
              </h1>
              <p className="text-sm text-muted-foreground">
                Create test datasets and run regression tests
              </p>
            </div>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Dataset
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Dataset</DialogTitle>
                <DialogDescription>
                  Create a new test dataset for regression testing.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Name</Label>
                  <Input
                    placeholder="e.g., Customer Support QA"
                    value={newDataset.name}
                    onChange={(e) => setNewDataset({ ...newDataset, name: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="Brief description of this dataset..."
                    value={newDataset.description}
                    onChange={(e) => setNewDataset({ ...newDataset, description: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={createDataset} disabled={!newDataset.name}>
                  Create Dataset
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="datasets" className="gap-2">
              <Database className="h-4 w-4" />
              Datasets
            </TabsTrigger>
            <TabsTrigger value="runs" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Recent Runs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="datasets">
            <Card>
              <CardContent className="pt-6">
                {loading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : datasets.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No datasets yet.</p>
                    <p className="text-sm">Create a dataset to start testing.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="w-[120px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {datasets.map((ds) => (
                        <TableRow key={ds.id} className="cursor-pointer hover:bg-muted/50">
                          <TableCell 
                            className="font-medium"
                            onClick={() => fetchDatasetDetail(ds.id)}
                          >
                            {ds.name}
                          </TableCell>
                          <TableCell 
                            className="text-muted-foreground max-w-[200px] truncate"
                            onClick={() => fetchDatasetDetail(ds.id)}
                          >
                            {ds.description || '-'}
                          </TableCell>
                          <TableCell onClick={() => fetchDatasetDetail(ds.id)}>
                            <Badge variant="outline">{ds.item_count}</Badge>
                          </TableCell>
                          <TableCell 
                            className="text-sm text-muted-foreground"
                            onClick={() => fetchDatasetDetail(ds.id)}
                          >
                            {new Date(ds.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => fetchDatasetDetail(ds.id)}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteDataset(ds.id)}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="runs">
            <Card>
              <CardContent className="pt-6">
                {runs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Play className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No test runs yet.</p>
                    <p className="text-sm">Create a dataset and run tests.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dataset</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Avg Score</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead>Started</TableHead>
                        <TableHead className="w-[80px]">View</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.map((run) => (
                        <TableRow key={run.id}>
                          <TableCell className="font-medium">{run.dataset_name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(run.status)}
                              <span className="capitalize">{run.status}</span>
                            </div>
                          </TableCell>
                          <TableCell>{run.completed_items}/{run.total_items}</TableCell>
                          <TableCell>
                            {run.summary?.avg_score !== undefined ? (
                              <span className={getScoreColor(run.summary.avg_score)}>
                                {(run.summary.avg_score * 100).toFixed(0)}%
                              </span>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{run.model}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(run.started_at).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => fetchRunDetail(run.id)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
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

