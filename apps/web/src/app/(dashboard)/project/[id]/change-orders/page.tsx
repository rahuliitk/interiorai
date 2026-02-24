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
  Textarea,
  toast,
} from '@openlintel/ui';
import {
  FileEdit,
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  CalendarDays,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';

/* ─── Constants ─────────────────────────────────────────────── */

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/* ─── Page Component ────────────────────────────────────────── */

export default function ChangeOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [costImpact, setCostImpact] = useState('');
  const [timeImpactDays, setTimeImpactDays] = useState('');

  /* ── Queries ──────────────────────────────────────────────── */
  const { data: changeOrders = [], isLoading } = trpc.schedule.listChangeOrders.useQuery({ projectId });

  /* ── Mutations ────────────────────────────────────────────── */
  const createChangeOrder = trpc.schedule.createChangeOrder.useMutation({
    onSuccess: () => {
      utils.schedule.listChangeOrders.invalidate();
      setDialogOpen(false);
      resetForm();
      toast({ title: 'Change order created', description: 'The change order has been submitted.' });
    },
    onError: (err) => {
      toast({ title: 'Failed to create change order', description: err.message, variant: 'destructive' });
    },
  });

  const updateChangeOrder = trpc.schedule.updateChangeOrder.useMutation({
    onSuccess: () => {
      utils.schedule.listChangeOrders.invalidate();
      toast({ title: 'Change order updated' });
    },
    onError: (err) => {
      toast({ title: 'Failed to update change order', description: err.message, variant: 'destructive' });
    },
  });

  const analyzeImpact = trpc.schedule.analyzeChangeOrderImpact.useMutation({
    onSuccess: (data) => {
      toast({ title: 'Impact analysis complete', description: data.summary || 'Analysis returned.' });
    },
    onError: (err) => {
      toast({ title: 'Impact analysis failed', description: err.message, variant: 'destructive' });
    },
  });

  /* ── Form helpers ─────────────────────────────────────────── */
  function resetForm() {
    setTitle('');
    setDescription('');
    setCostImpact('');
    setTimeImpactDays('');
  }

  function handleCreate() {
    if (!title) return;
    createChangeOrder.mutate({
      projectId,
      title,
      description: description || undefined,
      costImpact: costImpact ? parseFloat(costImpact) : undefined,
      timeImpactDays: timeImpactDays ? parseInt(timeImpactDays, 10) : undefined,
    });
  }

  /* ── Derived data ─────────────────────────────────────────── */
  const filtered = statusFilter === 'all'
    ? changeOrders
    : changeOrders.filter((co: any) => co.status === statusFilter);

  const totalCount = changeOrders.length;
  const pendingCount = changeOrders.filter((co: any) => co.status === 'pending').length;
  const approvedOrders = changeOrders.filter((co: any) => co.status === 'approved');
  const approvedCostImpact = approvedOrders.reduce((sum: number, co: any) => sum + (co.costImpact || 0), 0);
  const approvedTimeImpact = approvedOrders.reduce((sum: number, co: any) => sum + (co.timeImpactDays || 0), 0);

  /* ── Loading state ────────────────────────────────────────── */
  if (isLoading) {
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
          <FileEdit className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Change Orders</h1>
            <p className="text-sm text-muted-foreground">
              Track scope changes, cost impacts, and schedule adjustments.
            </p>
          </div>
        </div>
      </div>

      {/* ── Summary Cards ───────────────────────────────────── */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-2xl font-bold">{totalCount}</p>
              </div>
              <FileEdit className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Approved Cost Impact</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(approvedCostImpact)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Approved Time Impact</p>
                <p className="text-2xl font-bold text-blue-600">
                  {approvedTimeImpact} days
                </p>
              </div>
              <CalendarDays className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Status Filter Tabs ──────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              New Change Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Change Order</DialogTitle>
              <DialogDescription>
                Submit a change order to track scope, cost, and timeline changes.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="coTitle">Title</Label>
                <Input
                  id="coTitle"
                  placeholder="e.g. Upgrade kitchen countertop to granite"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coDescription">Description</Label>
                <Textarea
                  id="coDescription"
                  placeholder="Describe the change and its rationale..."
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="coCost">Cost Impact ($)</Label>
                  <Input
                    id="coCost"
                    type="number"
                    placeholder="e.g. 5000"
                    value={costImpact}
                    onChange={(e) => setCostImpact(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="coTime">Time Impact (days)</Label>
                  <Input
                    id="coTime"
                    type="number"
                    placeholder="e.g. 3"
                    value={timeImpactDays}
                    onChange={(e) => setTimeImpactDays(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createChangeOrder.isPending || !title}
              >
                {createChangeOrder.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Order'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Change Order Cards ──────────────────────────────── */}
      {filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((co: any) => (
            <Card key={co.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{co.title}</CardTitle>
                    <CardDescription className="mt-0.5">
                      Created {formatDate(co.createdAt)}
                    </CardDescription>
                  </div>
                  <Badge className={`ml-2 flex-shrink-0 text-[10px] ${STATUS_COLORS[co.status] || ''}`}>
                    {co.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {co.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{co.description}</p>
                )}

                {/* Impact badges */}
                <div className="flex flex-wrap gap-2">
                  {co.costImpact != null && (
                    <div className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                      <DollarSign className="h-3 w-3" />
                      {formatCurrency(co.costImpact)}
                    </div>
                  )}
                  {co.timeImpactDays != null && (
                    <div className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                      <CalendarDays className="h-3 w-3" />
                      {co.timeImpactDays} days
                    </div>
                  )}
                </div>

                {/* Metadata */}
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Created</span>
                    <span className="font-medium">{formatDate(co.createdAt)}</span>
                  </div>
                  {co.approvedAt && (
                    <div className="flex items-center justify-between text-xs mt-1">
                      <span className="text-muted-foreground">Approved</span>
                      <span className="font-medium text-green-600">{formatDate(co.approvedAt)}</span>
                    </div>
                  )}
                  {co.approvedBy && (
                    <div className="flex items-center justify-between text-xs mt-1">
                      <span className="text-muted-foreground">Approved By</span>
                      <span className="font-medium">{co.approvedBy}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  {co.status === 'pending' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-green-200 text-green-700 hover:bg-green-50"
                        disabled={updateChangeOrder.isPending}
                        onClick={() => updateChangeOrder.mutate({ id: co.id, status: 'approved' })}
                      >
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-red-200 text-red-700 hover:bg-red-50"
                        disabled={updateChangeOrder.isPending}
                        onClick={() => updateChangeOrder.mutate({ id: co.id, status: 'rejected' })}
                      >
                        <XCircle className="mr-1 h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </>
                  )}
                  {co.status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={analyzeImpact.isPending}
                      onClick={() => analyzeImpact.mutate({ id: co.id })}
                    >
                      {analyzeImpact.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <TrendingUp className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  {co.status === 'approved' && (
                    <div className="flex flex-1 items-center gap-1.5 text-xs text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      Approved
                    </div>
                  )}
                  {co.status === 'rejected' && (
                    <div className="flex flex-1 items-center gap-1.5 text-xs text-red-600">
                      <XCircle className="h-4 w-4" />
                      Rejected
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <FileEdit className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">No Change Orders</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Create change orders to track scope changes, cost impacts, and schedule adjustments.
          </p>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            New Change Order
          </Button>
        </Card>
      )}

      {/* ── Impact Analysis Section ─────────────────────────── */}
      {approvedOrders.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold">Impact Summary</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold">{approvedOrders.length}</p>
                <p className="text-xs text-muted-foreground">Approved Changes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className={`text-2xl font-bold ${approvedCostImpact >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(approvedCostImpact)}
                </p>
                <p className="text-xs text-muted-foreground">Total Cost Impact</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold text-blue-600">{approvedTimeImpact} days</p>
                <p className="text-xs text-muted-foreground">Total Time Impact</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
