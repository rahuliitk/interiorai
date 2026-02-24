'use client';

import { use, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Skeleton,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Textarea,
  toast,
} from '@openlintel/ui';
import {
  ClipboardCheck,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  ListChecks,
  Bug,
  ChevronRight,
  Eye,
} from 'lucide-react';

/* ─── Constants ─────────────────────────────────────────────── */

const MILESTONE_OPTIONS = [
  { value: 'demolition_complete', label: 'Demolition Complete' },
  { value: 'rough_in_complete', label: 'Rough-In Complete' },
  { value: 'waterproofing_complete', label: 'Waterproofing Complete' },
  { value: 'drywall_complete', label: 'Drywall Complete' },
  { value: 'painting_complete', label: 'Painting Complete' },
  { value: 'flooring_complete', label: 'Flooring Complete' },
  { value: 'fixture_install', label: 'Fixture Installation' },
  { value: 'final_walkthrough', label: 'Final Walkthrough' },
] as const;

const TRADE_OPTIONS = [
  { value: 'electrical', label: 'Electrical' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'carpentry', label: 'Carpentry' },
  { value: 'painting', label: 'Painting' },
  { value: 'tiling', label: 'Tiling' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'general', label: 'General' },
] as const;

const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
  { value: 'observation', label: 'Observation' },
] as const;

const PUNCH_CATEGORY_OPTIONS = [
  { value: 'structural', label: 'Structural' },
  { value: 'finish', label: 'Finish' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'carpentry', label: 'Carpentry' },
  { value: 'painting', label: 'Painting' },
] as const;

const CHECKPOINT_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  passed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  major: 'bg-orange-100 text-orange-800',
  minor: 'bg-yellow-100 text-yellow-800',
  observation: 'bg-gray-100 text-gray-800',
};

const PUNCH_STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 text-red-800',
  in_progress: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
  verified: 'bg-emerald-100 text-emerald-800',
  reopened: 'bg-orange-100 text-orange-800',
};

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ─── Page Component ────────────────────────────────────────── */

export default function QualityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  const [activeTab, setActiveTab] = useState<'checkpoints' | 'punchlist'>('checkpoints');

  /* ── Checkpoint dialog state ──────────────────────────────── */
  const [cpDialogOpen, setCpDialogOpen] = useState(false);
  const [cpMilestone, setCpMilestone] = useState('');
  const [cpTitle, setCpTitle] = useState('');
  const [cpDescription, setCpDescription] = useState('');
  const [cpTrade, setCpTrade] = useState('');
  const [cpChecklistInput, setCpChecklistInput] = useState('');

  /* ── Punch item dialog state ──────────────────────────────── */
  const [piDialogOpen, setPiDialogOpen] = useState(false);
  const [piTitle, setPiTitle] = useState('');
  const [piDescription, setPiDescription] = useState('');
  const [piSeverity, setPiSeverity] = useState('');
  const [piCategory, setPiCategory] = useState('');
  const [piAssignedTo, setPiAssignedTo] = useState('');

  /* ── Queries ──────────────────────────────────────────────── */
  const { data: checkpoints = [], isLoading: cpLoading } = trpc.quality.listCheckpoints.useQuery({ projectId });
  const { data: punchItems = [], isLoading: piLoading } = trpc.quality.listPunchItems.useQuery({ projectId });
  const { data: dashboard, isLoading: dashLoading } = trpc.quality.getDashboard.useQuery({ projectId });

  /* ── Mutations ────────────────────────────────────────────── */
  const createCheckpoint = trpc.quality.createCheckpoint.useMutation({
    onSuccess: () => {
      utils.quality.invalidate();
      setCpDialogOpen(false);
      resetCpForm();
      toast({ title: 'Checkpoint created', description: 'Quality checkpoint has been added.' });
    },
    onError: (err) => {
      toast({ title: 'Failed to create checkpoint', description: err.message, variant: 'destructive' });
    },
  });

  const updateCheckpoint = trpc.quality.updateCheckpoint.useMutation({
    onSuccess: () => {
      utils.quality.invalidate();
      toast({ title: 'Checkpoint updated' });
    },
    onError: (err) => {
      toast({ title: 'Failed to update checkpoint', description: err.message, variant: 'destructive' });
    },
  });

  const deleteCheckpoint = trpc.quality.deleteCheckpoint.useMutation({
    onSuccess: () => {
      utils.quality.invalidate();
      toast({ title: 'Checkpoint deleted' });
    },
    onError: (err) => {
      toast({ title: 'Failed to delete checkpoint', description: err.message, variant: 'destructive' });
    },
  });

  const createPunchItem = trpc.quality.createPunchItem.useMutation({
    onSuccess: () => {
      utils.quality.invalidate();
      setPiDialogOpen(false);
      resetPiForm();
      toast({ title: 'Punch item created', description: 'The punch list item has been added.' });
    },
    onError: (err) => {
      toast({ title: 'Failed to create punch item', description: err.message, variant: 'destructive' });
    },
  });

  const updatePunchItem = trpc.quality.updatePunchItem.useMutation({
    onSuccess: () => {
      utils.quality.invalidate();
      toast({ title: 'Punch item updated' });
    },
    onError: (err) => {
      toast({ title: 'Failed to update punch item', description: err.message, variant: 'destructive' });
    },
  });

  const deletePunchItem = trpc.quality.deletePunchItem.useMutation({
    onSuccess: () => {
      utils.quality.invalidate();
      toast({ title: 'Punch item deleted' });
    },
    onError: (err) => {
      toast({ title: 'Failed to delete punch item', description: err.message, variant: 'destructive' });
    },
  });

  /* ── Form helpers ─────────────────────────────────────────── */
  function resetCpForm() {
    setCpMilestone('');
    setCpTitle('');
    setCpDescription('');
    setCpTrade('');
    setCpChecklistInput('');
  }

  function resetPiForm() {
    setPiTitle('');
    setPiDescription('');
    setPiSeverity('');
    setPiCategory('');
    setPiAssignedTo('');
  }

  function handleCreateCheckpoint() {
    if (!cpMilestone || !cpTitle) return;
    const checklistItems = cpChecklistInput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((item) => ({ item, checked: false }));
    createCheckpoint.mutate({
      projectId,
      milestone: cpMilestone,
      title: cpTitle,
      description: cpDescription || undefined,
      trade: cpTrade || undefined,
      checklistItems: checklistItems.length > 0 ? checklistItems : undefined,
    });
  }

  function handleCreatePunchItem() {
    if (!piTitle) return;
    createPunchItem.mutate({
      projectId,
      title: piTitle,
      description: piDescription || undefined,
      severity: (piSeverity as 'critical' | 'major' | 'minor' | 'observation') || undefined,
      category: piCategory || undefined,
      assignedTo: piAssignedTo || undefined,
    });
  }

  /* ── Loading state ────────────────────────────────────────── */
  if (cpLoading && piLoading && dashLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Quality Assurance &amp; Punch List</h1>
            <p className="text-sm text-muted-foreground">
              Manage quality checkpoints, inspections, and punch list items.
            </p>
          </div>
        </div>
      </div>

      {/* ── Dashboard Summary Cards ─────────────────────────── */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Checkpoints</p>
                <p className="text-2xl font-bold">{dashboard?.checkpoints.total ?? 0}</p>
              </div>
              <ListChecks className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <span className="text-green-600">{dashboard?.checkpoints.byStatus.passed ?? 0} passed</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-red-600">{dashboard?.checkpoints.byStatus.failed ?? 0} failed</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-gray-600">{dashboard?.checkpoints.byStatus.pending ?? 0} pending</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Punch Items</p>
                <p className="text-2xl font-bold">{dashboard?.punchItems.total ?? 0}</p>
              </div>
              <Bug className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <span className="text-red-600">{dashboard?.punchItems.byStatus.open ?? 0} open</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-green-600">{dashboard?.punchItems.byStatus.resolved ?? 0} resolved</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-emerald-600">{dashboard?.punchItems.byStatus.verified ?? 0} verified</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Critical Items</p>
                <p className="text-2xl font-bold text-red-600">{dashboard?.punchItems.bySeverity.critical ?? 0}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-400" />
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <span className="text-orange-600">{dashboard?.punchItems.bySeverity.major ?? 0} major</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-yellow-600">{dashboard?.punchItems.bySeverity.minor ?? 0} minor</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pass Rate</p>
                <p className="text-2xl font-bold">
                  {dashboard && dashboard.checkpoints.total > 0
                    ? `${Math.round((dashboard.checkpoints.byStatus.passed / dashboard.checkpoints.total) * 100)}%`
                    : '--'}
                </p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-400" />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {dashboard?.checkpoints.byStatus.in_progress ?? 0} in progress
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Tab Switcher ────────────────────────────────────── */}
      <div className="mb-6 flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
        <button
          onClick={() => setActiveTab('checkpoints')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'checkpoints'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ListChecks className="mr-2 inline-block h-4 w-4" />
          Quality Checkpoints
        </button>
        <button
          onClick={() => setActiveTab('punchlist')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'punchlist'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Bug className="mr-2 inline-block h-4 w-4" />
          Punch List
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ── Quality Checkpoints Tab ─────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === 'checkpoints' && (
        <>
          {/* Add Checkpoint Button + Dialog */}
          <div className="mb-4 flex justify-end">
            <Dialog open={cpDialogOpen} onOpenChange={setCpDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  Add Checkpoint
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>New Quality Checkpoint</DialogTitle>
                  <DialogDescription>
                    Create an inspection checkpoint for a project milestone.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="cpTitle">Title</Label>
                    <Input
                      id="cpTitle"
                      placeholder="e.g. Kitchen rough-in inspection"
                      value={cpTitle}
                      onChange={(e) => setCpTitle(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Milestone</Label>
                      <Select value={cpMilestone} onValueChange={setCpMilestone}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select milestone" />
                        </SelectTrigger>
                        <SelectContent>
                          {MILESTONE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Trade</Label>
                      <Select value={cpTrade} onValueChange={setCpTrade}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select trade" />
                        </SelectTrigger>
                        <SelectContent>
                          {TRADE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cpDescription">Description</Label>
                    <Textarea
                      id="cpDescription"
                      placeholder="Describe what should be inspected..."
                      rows={2}
                      value={cpDescription}
                      onChange={(e) => setCpDescription(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cpChecklist">Checklist Items (one per line)</Label>
                    <Textarea
                      id="cpChecklist"
                      placeholder={"Check pipe connections\nVerify waterproofing membrane\nInspect electrical wiring"}
                      rows={4}
                      value={cpChecklistInput}
                      onChange={(e) => setCpChecklistInput(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter each checklist item on a separate line.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCpDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateCheckpoint}
                    disabled={createCheckpoint.isPending || !cpTitle || !cpMilestone}
                  >
                    {createCheckpoint.isPending ? (
                      <>
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create Checkpoint'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Checkpoint List */}
          {checkpoints.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {checkpoints.map((cp: any) => (
                <Card key={cp.id} className="relative">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{cp.title}</CardTitle>
                        <CardDescription className="mt-0.5">
                          {formatLabel(cp.milestone)}
                          {cp.trade && <span> &middot; {formatLabel(cp.trade)}</span>}
                        </CardDescription>
                      </div>
                      <Badge className={`ml-2 flex-shrink-0 text-[10px] ${CHECKPOINT_STATUS_COLORS[cp.status] || ''}`}>
                        {formatLabel(cp.status)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {cp.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{cp.description}</p>
                    )}

                    {/* Checklist preview */}
                    {cp.checklistItems && Array.isArray(cp.checklistItems) && cp.checklistItems.length > 0 && (
                      <div className="rounded-lg bg-muted/50 p-2.5">
                        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Checklist</p>
                        <div className="space-y-1">
                          {(cp.checklistItems as { item: string; checked: boolean }[]).slice(0, 4).map((ci, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              {ci.checked ? (
                                <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-green-600" />
                              ) : (
                                <div className="h-3.5 w-3.5 flex-shrink-0 rounded-full border border-gray-300" />
                              )}
                              <span className={ci.checked ? 'line-through text-muted-foreground' : ''}>{ci.item}</span>
                            </div>
                          ))}
                          {(cp.checklistItems as any[]).length > 4 && (
                            <p className="text-xs text-muted-foreground">
                              +{(cp.checklistItems as any[]).length - 4} more items
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Dates */}
                    <div className="rounded-lg bg-muted/50 p-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Created</span>
                        <span className="font-medium">{formatDate(cp.createdAt)}</span>
                      </div>
                      {cp.inspectedAt && (
                        <div className="flex items-center justify-between text-xs mt-1">
                          <span className="text-muted-foreground">Inspected</span>
                          <span className="font-medium">{formatDate(cp.inspectedAt)}</span>
                        </div>
                      )}
                      {cp.inspectedBy && (
                        <div className="flex items-center justify-between text-xs mt-1">
                          <span className="text-muted-foreground">Inspector</span>
                          <span className="font-medium">{cp.inspectedBy}</span>
                        </div>
                      )}
                    </div>

                    {/* Status actions */}
                    <div className="flex items-center gap-2 pt-1">
                      {cp.status === 'pending' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          disabled={updateCheckpoint.isPending}
                          onClick={() => updateCheckpoint.mutate({ id: cp.id, status: 'in_progress' })}
                        >
                          <Clock className="mr-1 h-3.5 w-3.5" />
                          Start
                        </Button>
                      )}
                      {(cp.status === 'pending' || cp.status === 'in_progress') && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 border-green-200 text-green-700 hover:bg-green-50"
                            disabled={updateCheckpoint.isPending}
                            onClick={() => updateCheckpoint.mutate({ id: cp.id, status: 'passed' })}
                          >
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                            Pass
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 border-red-200 text-red-700 hover:bg-red-50"
                            disabled={updateCheckpoint.isPending}
                            onClick={() => updateCheckpoint.mutate({ id: cp.id, status: 'failed' })}
                          >
                            <XCircle className="mr-1 h-3.5 w-3.5" />
                            Fail
                          </Button>
                        </>
                      )}
                      {cp.status === 'failed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          disabled={updateCheckpoint.isPending}
                          onClick={() => updateCheckpoint.mutate({ id: cp.id, status: 'pending' })}
                        >
                          Re-inspect
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteCheckpoint.mutate({ id: cp.id })}
                        disabled={deleteCheckpoint.isPending}
                      >
                        {deleteCheckpoint.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="flex flex-col items-center justify-center p-12 text-center">
              <ListChecks className="mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-lg font-semibold">No Quality Checkpoints</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Create checkpoints to track quality inspections at each project milestone.
              </p>
              <Button size="sm" onClick={() => setCpDialogOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Add Checkpoint
              </Button>
            </Card>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ── Punch List Tab ──────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === 'punchlist' && (
        <>
          {/* Add Punch Item Button + Dialog */}
          <div className="mb-4 flex justify-end">
            <Dialog open={piDialogOpen} onOpenChange={setPiDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  Add Punch Item
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>New Punch List Item</DialogTitle>
                  <DialogDescription>
                    Log a defect, snag, or observation that needs attention.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="piTitle">Title</Label>
                    <Input
                      id="piTitle"
                      placeholder="e.g. Scratched countertop in kitchen"
                      value={piTitle}
                      onChange={(e) => setPiTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="piDescription">Description</Label>
                    <Textarea
                      id="piDescription"
                      placeholder="Provide details about the issue..."
                      rows={3}
                      value={piDescription}
                      onChange={(e) => setPiDescription(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Severity</Label>
                      <Select value={piSeverity} onValueChange={setPiSeverity}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select severity" />
                        </SelectTrigger>
                        <SelectContent>
                          {SEVERITY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={piCategory} onValueChange={setPiCategory}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {PUNCH_CATEGORY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="piAssignedTo">Assigned To</Label>
                    <Input
                      id="piAssignedTo"
                      placeholder="e.g. John's Plumbing Co."
                      value={piAssignedTo}
                      onChange={(e) => setPiAssignedTo(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPiDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreatePunchItem}
                    disabled={createPunchItem.isPending || !piTitle}
                  >
                    {createPunchItem.isPending ? (
                      <>
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create Item'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Punch List Items */}
          {punchItems.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {punchItems.map((item: any) => (
                <Card key={item.id} className="relative">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{item.title}</CardTitle>
                        <CardDescription className="mt-0.5">
                          {item.category && <span>{formatLabel(item.category)}</span>}
                          {item.category && item.assignedTo && <span> &middot; </span>}
                          {item.assignedTo && <span>{item.assignedTo}</span>}
                          {!item.category && !item.assignedTo && (
                            <span>Created {formatDate(item.createdAt)}</span>
                          )}
                        </CardDescription>
                      </div>
                      <div className="ml-2 flex flex-col gap-1 flex-shrink-0">
                        <Badge className={`text-[10px] ${PUNCH_STATUS_COLORS[item.status] || ''}`}>
                          {formatLabel(item.status)}
                        </Badge>
                        <Badge className={`text-[10px] ${SEVERITY_COLORS[item.severity] || ''}`}>
                          {formatLabel(item.severity)}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {item.description && (
                      <p className="text-sm text-muted-foreground line-clamp-3">{item.description}</p>
                    )}

                    {/* Metadata */}
                    <div className="rounded-lg bg-muted/50 p-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Created</span>
                        <span className="font-medium">{formatDate(item.createdAt)}</span>
                      </div>
                      {item.assignedTo && (
                        <div className="flex items-center justify-between text-xs mt-1">
                          <span className="text-muted-foreground">Assigned To</span>
                          <span className="font-medium">{item.assignedTo}</span>
                        </div>
                      )}
                      {item.resolvedAt && (
                        <div className="flex items-center justify-between text-xs mt-1">
                          <span className="text-muted-foreground">Resolved</span>
                          <span className="font-medium text-green-600">{formatDate(item.resolvedAt)}</span>
                        </div>
                      )}
                      {item.verifiedAt && (
                        <div className="flex items-center justify-between text-xs mt-1">
                          <span className="text-muted-foreground">Verified</span>
                          <span className="font-medium text-emerald-600">{formatDate(item.verifiedAt)}</span>
                        </div>
                      )}
                    </div>

                    {/* Status actions */}
                    <div className="flex items-center gap-2 pt-1">
                      {item.status === 'open' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          disabled={updatePunchItem.isPending}
                          onClick={() => updatePunchItem.mutate({ id: item.id, status: 'in_progress' })}
                        >
                          <Clock className="mr-1 h-3.5 w-3.5" />
                          Start Work
                        </Button>
                      )}
                      {(item.status === 'open' || item.status === 'in_progress' || item.status === 'reopened') && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 border-green-200 text-green-700 hover:bg-green-50"
                          disabled={updatePunchItem.isPending}
                          onClick={() => updatePunchItem.mutate({ id: item.id, status: 'resolved' })}
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Resolve
                        </Button>
                      )}
                      {item.status === 'resolved' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            disabled={updatePunchItem.isPending}
                            onClick={() => updatePunchItem.mutate({ id: item.id, status: 'verified' })}
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            Verify
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 border-orange-200 text-orange-700 hover:bg-orange-50"
                            disabled={updatePunchItem.isPending}
                            onClick={() => updatePunchItem.mutate({ id: item.id, status: 'reopened' })}
                          >
                            Reopen
                          </Button>
                        </>
                      )}
                      {item.status === 'verified' && (
                        <div className="flex flex-1 items-center gap-1.5 text-xs text-emerald-600">
                          <CheckCircle2 className="h-4 w-4" />
                          Verified &amp; Complete
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deletePunchItem.mutate({ id: item.id })}
                        disabled={deletePunchItem.isPending}
                      >
                        {deletePunchItem.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="flex flex-col items-center justify-center p-12 text-center">
              <Bug className="mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-lg font-semibold">No Punch List Items</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Add punch list items to track defects, snags, and observations that need resolution.
              </p>
              <Button size="sm" onClick={() => setPiDialogOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Add Punch Item
              </Button>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
