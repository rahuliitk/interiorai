'use client';

import { use, useState, useMemo } from 'react';
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
  Truck,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  Package,
  PackageCheck,
  Clock,
  ClipboardCheck,
  ChevronDown,
  CheckCircle2,
  XCircle,
  MapPin,
} from 'lucide-react';

// ── Status configuration ──────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'inspected', label: 'Inspected' },
  { value: 'rejected', label: 'Rejected' },
] as const;

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-800',
  dispatched: 'bg-blue-100 text-blue-800',
  in_transit: 'bg-amber-100 text-amber-800',
  delivered: 'bg-green-100 text-green-800',
  inspected: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  dispatched: 'Dispatched',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  inspected: 'Inspected',
  rejected: 'Rejected',
};

const NEXT_STATUS: Record<string, string[]> = {
  pending: ['dispatched'],
  dispatched: ['in_transit'],
  in_transit: ['delivered', 'rejected'],
  delivered: ['inspected', 'rejected'],
  inspected: [],
  rejected: [],
};

// ── Helpers ───────────────────────────────────────────────────
function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '--';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function isOverdue(delivery: any): boolean {
  if (delivery.status === 'delivered' || delivery.status === 'inspected') return false;
  if (!delivery.estimatedDeliveryDate) return false;
  return new Date(delivery.estimatedDeliveryDate) < new Date();
}

// ── Inspection checklist item type ────────────────────────────
interface ChecklistItem {
  item: string;
  passed: boolean;
  note: string;
}

// ── Main Page Component ───────────────────────────────────────
export default function DeliveriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  // ── Filter state ────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // ── Create dialog state ─────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [vendorName, setVendorName] = useState('');
  const [description, setDescription] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [estimatedDate, setEstimatedDate] = useState('');

  // ── Inspection dialog state ─────────────────────────────────
  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectDeliveryId, setInspectDeliveryId] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [inspectionNotes, setInspectionNotes] = useState('');

  // ── Status update dropdown state ────────────────────────────
  const [statusMenuOpenId, setStatusMenuOpenId] = useState<string | null>(null);

  // ── Queries ─────────────────────────────────────────────────
  const queryInput = statusFilter === 'all'
    ? { projectId }
    : { projectId, status: statusFilter };

  const { data: deliveries = [], isLoading } = trpc.delivery.list.useQuery(queryInput);
  const { data: dashboard } = trpc.delivery.getDashboard.useQuery({ projectId });

  // ── Mutations ───────────────────────────────────────────────
  const createDelivery = trpc.delivery.create.useMutation({
    onSuccess: () => {
      utils.delivery.list.invalidate();
      utils.delivery.getDashboard.invalidate();
      setCreateOpen(false);
      resetCreateForm();
      toast({ title: 'Delivery created', description: 'The delivery has been added to tracking.' });
    },
    onError: (err) => {
      toast({ title: 'Failed to create delivery', description: err.message, variant: 'destructive' });
    },
  });

  const updateDelivery = trpc.delivery.update.useMutation({
    onSuccess: () => {
      utils.delivery.list.invalidate();
      utils.delivery.getDashboard.invalidate();
      setStatusMenuOpenId(null);
      toast({ title: 'Delivery updated', description: 'Status has been changed.' });
    },
    onError: (err) => {
      toast({ title: 'Failed to update delivery', description: err.message, variant: 'destructive' });
    },
  });

  const submitInspection = trpc.delivery.update.useMutation({
    onSuccess: () => {
      utils.delivery.list.invalidate();
      utils.delivery.getDashboard.invalidate();
      setInspectOpen(false);
      setInspectDeliveryId(null);
      setChecklist([]);
      setReceivedBy('');
      setInspectionNotes('');
      toast({ title: 'Inspection submitted', description: 'Delivery has been inspected and recorded.' });
    },
    onError: (err) => {
      toast({ title: 'Failed to submit inspection', description: err.message, variant: 'destructive' });
    },
  });

  const deleteDelivery = trpc.delivery.delete.useMutation({
    onSuccess: () => {
      utils.delivery.list.invalidate();
      utils.delivery.getDashboard.invalidate();
      toast({ title: 'Delivery deleted' });
    },
    onError: (err) => {
      toast({ title: 'Failed to delete delivery', description: err.message, variant: 'destructive' });
    },
  });

  // ── Form handlers ───────────────────────────────────────────
  function resetCreateForm() {
    setVendorName('');
    setDescription('');
    setTrackingNumber('');
    setEstimatedDate('');
  }

  function handleCreate() {
    if (!vendorName.trim() || !description.trim()) return;
    createDelivery.mutate({
      projectId,
      vendorName: vendorName.trim(),
      description: description.trim(),
      trackingNumber: trackingNumber.trim() || undefined,
      estimatedDeliveryDate: estimatedDate ? new Date(estimatedDate) : undefined,
    });
  }

  function handleStatusChange(deliveryId: string, newStatus: string) {
    updateDelivery.mutate({
      id: deliveryId,
      status: newStatus as any,
    });
  }

  function openInspection(deliveryId: string) {
    setInspectDeliveryId(deliveryId);
    setChecklist([]);
    setNewChecklistItem('');
    setReceivedBy('');
    setInspectionNotes('');
    setInspectOpen(true);
  }

  function addChecklistItem() {
    if (!newChecklistItem.trim()) return;
    setChecklist((prev) => [
      ...prev,
      { item: newChecklistItem.trim(), passed: true, note: '' },
    ]);
    setNewChecklistItem('');
  }

  function toggleChecklistPassed(index: number) {
    setChecklist((prev) =>
      prev.map((c, i) => (i === index ? { ...c, passed: !c.passed } : c))
    );
  }

  function updateChecklistNote(index: number, note: string) {
    setChecklist((prev) =>
      prev.map((c, i) => (i === index ? { ...c, note } : c))
    );
  }

  function removeChecklistItem(index: number) {
    setChecklist((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmitInspection() {
    if (!inspectDeliveryId) return;
    const allPassed = checklist.length > 0 && checklist.every((c) => c.passed);
    submitInspection.mutate({
      id: inspectDeliveryId,
      status: allPassed ? 'inspected' : 'rejected',
      inspectionChecklist: checklist,
      receivedBy: receivedBy.trim() || undefined,
      notes: inspectionNotes.trim() || undefined,
    });
  }

  // ── Dashboard metrics ───────────────────────────────────────
  const totalCount = dashboard?.total ?? 0;
  const inTransitCount = dashboard?.byStatus?.in_transit ?? 0;
  const deliveredCount = (dashboard?.byStatus?.delivered ?? 0) + (dashboard?.byStatus?.inspected ?? 0);
  const overdueCount = dashboard?.overdueCount ?? 0;

  // ── Loading state ───────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Truck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Delivery Tracking</h1>
            <p className="text-sm text-muted-foreground">
              Track deliveries, update statuses, and inspect received materials.
            </p>
          </div>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              New Delivery
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Delivery</DialogTitle>
              <DialogDescription>
                Add a new delivery to track for this project.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="vendorName">Vendor Name</Label>
                <Input
                  id="vendorName"
                  placeholder="e.g. ABC Building Supplies"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="e.g. Steel beams for 2nd floor framing"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="trackingNumber">Tracking Number</Label>
                  <Input
                    id="trackingNumber"
                    placeholder="e.g. TRK-2024-001"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estimatedDate">Estimated Delivery</Label>
                  <Input
                    id="estimatedDate"
                    type="date"
                    value={estimatedDate}
                    onChange={(e) => setEstimatedDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createDelivery.isPending || !vendorName.trim() || !description.trim()}
              >
                {createDelivery.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Delivery'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Dashboard Summary Cards ────────────────────────── */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <Package className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Deliveries</p>
              <p className="text-2xl font-bold">{totalCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
              <Truck className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">In Transit</p>
              <p className="text-2xl font-bold">{inTransitCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <PackageCheck className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Delivered</p>
              <p className="text-2xl font-bold">{deliveredCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
              <AlertTriangle className="h-5 w-5 text-red-700" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Overdue</p>
              <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Status Filter Buttons ──────────────────────────── */}
      <div className="mb-6 flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((opt) => {
          const isActive = statusFilter === opt.value;
          return (
            <Button
              key={opt.value}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label}
              {opt.value !== 'all' && dashboard?.byStatus?.[opt.value] !== undefined && (
                <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                  {dashboard.byStatus[opt.value] ?? 0}
                </span>
              )}
            </Button>
          );
        })}
      </div>

      {/* ── Overdue Alerts Banner ──────────────────────────── */}
      {overdueCount > 0 && statusFilter === 'all' && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-medium text-red-800">
              {overdueCount} deliver{overdueCount === 1 ? 'y' : 'ies'} overdue
            </p>
            <p className="text-xs text-red-600">
              {(dashboard?.overdue ?? []).map((d: any) => d.vendorName).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* ── Inspection Dialog ──────────────────────────────── */}
      <Dialog open={inspectOpen} onOpenChange={setInspectOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Delivery Inspection</DialogTitle>
            <DialogDescription>
              Complete the inspection checklist for the received delivery.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Add checklist items */}
            <div className="space-y-2">
              <Label>Inspection Checklist</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add checklist item, e.g. Quantity matches PO"
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addChecklistItem();
                    }
                  }}
                />
                <Button variant="outline" size="sm" onClick={addChecklistItem}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Checklist items list */}
            {checklist.length > 0 && (
              <div className="space-y-2 rounded-lg border p-3">
                {checklist.map((item, index) => (
                  <div key={index} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="flex-shrink-0"
                        onClick={() => toggleChecklistPassed(index)}
                      >
                        {item.passed ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600" />
                        )}
                      </button>
                      <span className="flex-1 text-sm">{item.item}</span>
                      <Badge className={item.passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                        {item.passed ? 'Pass' : 'Fail'}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeChecklistItem(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Input
                      placeholder="Note (optional)"
                      className="ml-7 h-7 text-xs"
                      value={item.note}
                      onChange={(e) => updateChecklistNote(index, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}

            {checklist.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">
                No checklist items yet. Add items above to begin the inspection.
              </p>
            )}

            {/* Received by */}
            <div className="space-y-2">
              <Label htmlFor="receivedBy">Received By</Label>
              <Input
                id="receivedBy"
                placeholder="Name of person receiving the delivery"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="inspectionNotes">Additional Notes</Label>
              <Textarea
                id="inspectionNotes"
                placeholder="Any additional notes about the delivery condition..."
                rows={3}
                value={inspectionNotes}
                onChange={(e) => setInspectionNotes(e.target.value)}
              />
            </div>

            {/* Summary */}
            {checklist.length > 0 && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-sm font-medium">Inspection Summary</p>
                <div className="mt-1 flex gap-4 text-xs">
                  <span className="text-green-700">
                    {checklist.filter((c) => c.passed).length} passed
                  </span>
                  <span className="text-red-700">
                    {checklist.filter((c) => !c.passed).length} failed
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Result: {checklist.every((c) => c.passed) ? (
                    <span className="font-medium text-green-700">All items passed -- will be marked Inspected</span>
                  ) : (
                    <span className="font-medium text-red-700">Some items failed -- will be marked Rejected</span>
                  )}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInspectOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitInspection}
              disabled={submitInspection.isPending || checklist.length === 0}
            >
              {submitInspection.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Inspection'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delivery Cards ─────────────────────────────────── */}
      {deliveries.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {deliveries.map((delivery: any) => {
            const overdue = isOverdue(delivery);
            const nextStatuses = NEXT_STATUS[delivery.status] ?? [];
            const showInspect = delivery.status === 'delivered';
            const hasChecklist = delivery.inspectionChecklist && Array.isArray(delivery.inspectionChecklist) && delivery.inspectionChecklist.length > 0;

            return (
              <Card
                key={delivery.id}
                className={`relative ${overdue ? 'border-red-300 bg-red-50/30' : ''}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">
                        {delivery.vendorName}
                      </CardTitle>
                      <CardDescription className="mt-0.5 line-clamp-2">
                        {delivery.description}
                      </CardDescription>
                    </div>
                    <div className="ml-2 flex flex-col items-end gap-1">
                      <Badge className={`flex-shrink-0 text-[10px] ${STATUS_COLORS[delivery.status] || 'bg-gray-100 text-gray-800'}`}>
                        {STATUS_LABELS[delivery.status] || delivery.status}
                      </Badge>
                      {overdue && (
                        <Badge className="flex-shrink-0 text-[10px] bg-red-100 text-red-800">
                          Overdue
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Tracking number */}
                  {delivery.trackingNumber && (
                    <div className="flex items-center gap-2 text-xs">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-mono text-muted-foreground">
                        {delivery.trackingNumber}
                      </span>
                    </div>
                  )}

                  {/* Date info */}
                  <div className="rounded-lg bg-muted/50 p-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Estimated</span>
                      <span className={`font-medium ${overdue ? 'text-red-600' : ''}`}>
                        {formatDate(delivery.estimatedDeliveryDate)}
                      </span>
                    </div>
                    {delivery.actualDeliveryDate && (
                      <div className="flex items-center justify-between text-xs mt-1">
                        <span className="text-muted-foreground">Actual</span>
                        <span className="font-medium text-green-700">
                          {formatDate(delivery.actualDeliveryDate)}
                        </span>
                      </div>
                    )}
                    {delivery.receivedBy && (
                      <div className="flex items-center justify-between text-xs mt-1">
                        <span className="text-muted-foreground">Received By</span>
                        <span className="font-medium">{delivery.receivedBy}</span>
                      </div>
                    )}
                  </div>

                  {/* Existing inspection checklist display */}
                  {hasChecklist && (
                    <div className="rounded-lg border p-2.5 space-y-1">
                      <p className="text-xs font-medium flex items-center gap-1">
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        Inspection Results
                      </p>
                      {(delivery.inspectionChecklist as any[]).map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-1.5 text-xs">
                          {item.passed ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ) : (
                            <XCircle className="h-3 w-3 text-red-600" />
                          )}
                          <span className={item.passed ? 'text-green-800' : 'text-red-800'}>
                            {item.item}
                          </span>
                          {item.note && (
                            <span className="text-muted-foreground">-- {item.note}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Notes display */}
                  {delivery.notes && (
                    <div className="rounded-lg bg-muted/30 p-2 text-xs text-muted-foreground">
                      {delivery.notes}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1">
                    {/* Status update dropdown */}
                    {nextStatuses.length > 0 && !showInspect && (
                      <div className="relative flex-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-between"
                          onClick={() =>
                            setStatusMenuOpenId(
                              statusMenuOpenId === delivery.id ? null : delivery.id
                            )
                          }
                          disabled={updateDelivery.isPending}
                        >
                          {updateDelivery.isPending ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <span className="text-xs">Update Status</span>
                          )}
                          <ChevronDown className="ml-1 h-3.5 w-3.5" />
                        </Button>
                        {statusMenuOpenId === delivery.id && (
                          <div className="absolute top-full left-0 z-10 mt-1 w-full rounded-md border bg-background shadow-md">
                            {nextStatuses.map((ns) => (
                              <button
                                key={ns}
                                type="button"
                                className="w-full px-3 py-2 text-left text-xs hover:bg-muted transition-colors first:rounded-t-md last:rounded-b-md"
                                onClick={() => handleStatusChange(delivery.id, ns)}
                              >
                                <Badge className={`text-[10px] ${STATUS_COLORS[ns]}`}>
                                  {STATUS_LABELS[ns]}
                                </Badge>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Inspect button for delivered items */}
                    {showInspect && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => openInspection(delivery.id)}
                      >
                        <ClipboardCheck className="mr-1 h-3.5 w-3.5" />
                        Inspect
                      </Button>
                    )}

                    {/* Status update for delivered items that also have next statuses */}
                    {showInspect && nextStatuses.length > 0 && (
                      <div className="relative">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setStatusMenuOpenId(
                              statusMenuOpenId === delivery.id ? null : delivery.id
                            )
                          }
                          disabled={updateDelivery.isPending}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                        {statusMenuOpenId === delivery.id && (
                          <div className="absolute top-full right-0 z-10 mt-1 w-36 rounded-md border bg-background shadow-md">
                            {nextStatuses.map((ns) => (
                              <button
                                key={ns}
                                type="button"
                                className="w-full px-3 py-2 text-left text-xs hover:bg-muted transition-colors first:rounded-t-md last:rounded-b-md"
                                onClick={() => handleStatusChange(delivery.id, ns)}
                              >
                                <Badge className={`text-[10px] ${STATUS_COLORS[ns]}`}>
                                  {STATUS_LABELS[ns]}
                                </Badge>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Delete button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteDelivery.mutate({ id: delivery.id })}
                      disabled={deleteDelivery.isPending}
                    >
                      {deleteDelivery.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* ── Empty State ───────────────────────────────────── */
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Truck className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">
            {statusFilter !== 'all' ? 'No Matching Deliveries' : 'No Deliveries'}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {statusFilter !== 'all'
              ? `No deliveries found with status "${STATUS_LABELS[statusFilter] ?? statusFilter}". Try a different filter.`
              : 'Add deliveries to track shipments, update statuses, and inspect received materials.'}
          </p>
          {statusFilter !== 'all' ? (
            <Button size="sm" variant="outline" onClick={() => setStatusFilter('all')}>
              Clear Filter
            </Button>
          ) : (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              New Delivery
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
