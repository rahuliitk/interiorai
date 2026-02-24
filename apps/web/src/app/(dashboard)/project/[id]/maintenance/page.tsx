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
  DialogFooter,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  toast,
} from '@openlintel/ui';
import {
  Wrench,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
} from 'lucide-react';

const CATEGORY_LABELS: Record<string, string> = {
  hvac: 'HVAC',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  structural: 'Structural',
  appliance: 'Appliance',
  exterior: 'Exterior',
};

const CATEGORY_COLORS: Record<string, string> = {
  hvac: 'bg-blue-100 text-blue-800',
  plumbing: 'bg-cyan-100 text-cyan-800',
  electrical: 'bg-yellow-100 text-yellow-800',
  structural: 'bg-stone-100 text-stone-800',
  appliance: 'bg-purple-100 text-purple-800',
  exterior: 'bg-green-100 text-green-800',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-gray-100 text-gray-800',
};

function getDueStatus(nextDueAt: string | Date): 'overdue' | 'soon' | 'ok' {
  const due = new Date(nextDueAt);
  const now = new Date();
  if (due <= now) return 'overdue';
  const diff = due.getTime() - now.getTime();
  const daysDiff = diff / (1000 * 60 * 60 * 24);
  if (daysDiff <= 7) return 'soon';
  return 'ok';
}

export default function MaintenancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  // Dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);

  // Add schedule form state
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState('');
  const [frequencyDays, setFrequencyDays] = useState('');
  const [nextDueAt, setNextDueAt] = useState('');
  const [provider, setProvider] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');

  // Log completion form state
  const [performedBy, setPerformedBy] = useState('');
  const [logCost, setLogCost] = useState('');
  const [logNotes, setLogNotes] = useState('');

  // Queries
  const { data: schedules = [], isLoading: loadingSchedules } =
    trpc.maintenance.list.useQuery({ projectId });
  const { data: dashboard, isLoading: loadingDashboard } =
    trpc.maintenance.getDashboard.useQuery({ projectId });

  // Mutations
  const createSchedule = trpc.maintenance.create.useMutation({
    onSuccess: () => {
      utils.maintenance.list.invalidate({ projectId });
      utils.maintenance.getDashboard.invalidate({ projectId });
      setAddOpen(false);
      resetAddForm();
      toast({ title: 'Schedule created', description: 'Maintenance schedule has been added.' });
    },
    onError: (err) => {
      toast({ title: 'Failed to create schedule', description: err.message, variant: 'destructive' });
    },
  });

  const logCompletion = trpc.maintenance.logCompletion.useMutation({
    onSuccess: () => {
      utils.maintenance.list.invalidate({ projectId });
      utils.maintenance.getDashboard.invalidate({ projectId });
      setCompleteOpen(false);
      setSelectedScheduleId(null);
      resetLogForm();
      toast({ title: 'Maintenance logged', description: 'Completion has been recorded.' });
    },
    onError: (err) => {
      toast({ title: 'Failed to log completion', description: err.message, variant: 'destructive' });
    },
  });

  const deleteSchedule = trpc.maintenance.delete.useMutation({
    onSuccess: () => {
      utils.maintenance.list.invalidate({ projectId });
      utils.maintenance.getDashboard.invalidate({ projectId });
      toast({ title: 'Schedule deleted' });
    },
    onError: (err) => {
      toast({ title: 'Failed to delete schedule', description: err.message, variant: 'destructive' });
    },
  });

  function resetAddForm() {
    setItemName('');
    setCategory('');
    setFrequencyDays('');
    setNextDueAt('');
    setProvider('');
    setEstimatedCost('');
  }

  function resetLogForm() {
    setPerformedBy('');
    setLogCost('');
    setLogNotes('');
  }

  function handleCreate() {
    if (!itemName || !category || !frequencyDays || !nextDueAt) return;
    createSchedule.mutate({
      projectId,
      itemName,
      category: category as 'hvac' | 'plumbing' | 'electrical' | 'structural' | 'appliance' | 'exterior',
      frequencyDays: parseInt(frequencyDays, 10),
      nextDueAt: new Date(nextDueAt),
      provider: provider || undefined,
      estimatedCost: estimatedCost ? parseFloat(estimatedCost) : undefined,
    });
  }

  function handleLogCompletion() {
    if (!selectedScheduleId) return;
    logCompletion.mutate({
      scheduleId: selectedScheduleId,
      performedBy: performedBy || undefined,
      cost: logCost ? parseFloat(logCost) : undefined,
      notes: logNotes || undefined,
    });
  }

  function openCompleteDialog(scheduleId: string) {
    setSelectedScheduleId(scheduleId);
    resetLogForm();
    setCompleteOpen(true);
  }

  const isLoading = loadingSchedules || loadingDashboard;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50">
            <Wrench className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Maintenance</h1>
            <p className="text-sm text-muted-foreground">
              Schedule and track recurring maintenance tasks.
            </p>
          </div>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              Add Schedule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Maintenance Schedule</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="itemName">Item Name</Label>
                <Input
                  id="itemName"
                  placeholder="e.g. AC Unit Filter Replacement"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hvac">HVAC</SelectItem>
                    <SelectItem value="plumbing">Plumbing</SelectItem>
                    <SelectItem value="electrical">Electrical</SelectItem>
                    <SelectItem value="structural">Structural</SelectItem>
                    <SelectItem value="appliance">Appliance</SelectItem>
                    <SelectItem value="exterior">Exterior</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="frequencyDays">Frequency (days)</Label>
                <Input
                  id="frequencyDays"
                  type="number"
                  min="1"
                  placeholder="e.g. 90"
                  value={frequencyDays}
                  onChange={(e) => setFrequencyDays(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nextDueAt">Next Due Date</Label>
                <Input
                  id="nextDueAt"
                  type="date"
                  value={nextDueAt}
                  onChange={(e) => setNextDueAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider">Provider (optional)</Label>
                <Input
                  id="provider"
                  placeholder="e.g. CoolAir Services"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estimatedCost">Estimated Cost (optional)</Label>
                <Input
                  id="estimatedCost"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 5000"
                  value={estimatedCost}
                  onChange={(e) => setEstimatedCost(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createSchedule.isPending || !itemName || !category || !frequencyDays || !nextDueAt}
              >
                {createSchedule.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Schedule'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Dashboard Stats */}
      {dashboard && (
        <div className="mb-6 grid gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{dashboard.overdueCount}</p>
                  <p className="text-xs text-muted-foreground">Overdue</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-50">
                  <Clock className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-600">{dashboard.upcomingCount}</p>
                  <p className="text-xs text-muted-foreground">Due in 7 Days</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                  <Calendar className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{dashboard.activeScheduleCount}</p>
                  <p className="text-xs text-muted-foreground">Active Schedules</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    ${dashboard.totalSpent.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Spent</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Log Completion Dialog */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Maintenance Completion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="performedBy">Performed By</Label>
              <Input
                id="performedBy"
                placeholder="e.g. John Smith"
                value={performedBy}
                onChange={(e) => setPerformedBy(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logCost">Cost</Label>
              <Input
                id="logCost"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 2500"
                value={logCost}
                onChange={(e) => setLogCost(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logNotes">Notes</Label>
              <Input
                id="logNotes"
                placeholder="Any additional notes..."
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleLogCompletion}
              disabled={logCompletion.isPending}
            >
              {logCompletion.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Log Completion'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule List */}
      {schedules.length > 0 ? (
        <div className="space-y-3">
          {schedules.map((schedule: any) => {
            const dueStatus = getDueStatus(schedule.nextDueAt);
            const dueDate = new Date(schedule.nextDueAt);

            return (
              <Card key={schedule.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{schedule.itemName}</CardTitle>
                        <Badge className={`text-[10px] ${CATEGORY_COLORS[schedule.category] || ''}`}>
                          {CATEGORY_LABELS[schedule.category] || schedule.category}
                        </Badge>
                        <Badge className={`text-[10px] ${STATUS_COLORS[schedule.status] || ''}`}>
                          {schedule.status}
                        </Badge>
                      </div>
                      <CardDescription className="mt-1">
                        Every {schedule.frequencyDays} days
                        {schedule.provider && (
                          <> &middot; {schedule.provider}</>
                        )}
                        {schedule.estimatedCost != null && (
                          <> &middot; Est. ${schedule.estimatedCost.toLocaleString()}</>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openCompleteDialog(schedule.id)}
                        disabled={schedule.status !== 'active'}
                      >
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                        Complete
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteSchedule.mutate({ id: schedule.id })}
                        disabled={deleteSchedule.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Next due:</span>
                      <span
                        className={
                          dueStatus === 'overdue'
                            ? 'font-medium text-red-600'
                            : dueStatus === 'soon'
                              ? 'font-medium text-yellow-600'
                              : 'font-medium'
                        }
                      >
                        {dueDate.toLocaleDateString()}
                      </span>
                      {dueStatus === 'overdue' && (
                        <Badge className="bg-red-100 text-red-800 text-[10px]">
                          <AlertTriangle className="mr-0.5 h-3 w-3" />
                          Overdue
                        </Badge>
                      )}
                      {dueStatus === 'soon' && (
                        <Badge className="bg-yellow-100 text-yellow-800 text-[10px]">
                          <Clock className="mr-0.5 h-3 w-3" />
                          Due Soon
                        </Badge>
                      )}
                    </div>
                    {schedule.latestLog && (
                      <div className="text-xs text-muted-foreground">
                        Last completed:{' '}
                        {new Date(schedule.latestLog.performedAt).toLocaleDateString()}
                        {schedule.latestLog.performedBy && (
                          <> by {schedule.latestLog.performedBy}</>
                        )}
                        {schedule.latestLog.cost != null && (
                          <> &middot; ${schedule.latestLog.cost.toLocaleString()}</>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Wrench className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">No Maintenance Schedules</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Create maintenance schedules to track recurring tasks like HVAC servicing,
            plumbing inspections, and more.
          </p>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add Schedule
          </Button>
        </Card>
      )}
    </div>
  );
}
