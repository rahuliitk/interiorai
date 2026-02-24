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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  toast,
} from '@openlintel/ui';
import {
  CalendarDays,
  Play,
  BarChart3,
  ListChecks,
  AlertTriangle,
} from 'lucide-react';
import { GanttChart } from '@/components/gantt-chart';
import { MilestoneTracker } from '@/components/milestone-tracker';

const TRADE_SEQUENCE = [
  { name: 'Demolition', key: 'demolition', durationDays: 5, isCritical: true },
  { name: 'Civil Work', key: 'civil', durationDays: 10, isCritical: true },
  { name: 'Plumbing Rough-In', key: 'plumbing rough-in', durationDays: 7, isCritical: true },
  { name: 'Electrical Rough-In', key: 'electrical rough-in', durationDays: 7, isCritical: false },
  { name: 'False Ceiling', key: 'false ceiling', durationDays: 6, isCritical: false },
  { name: 'Flooring', key: 'flooring', durationDays: 8, isCritical: true },
  { name: 'Carpentry', key: 'carpentry', durationDays: 14, isCritical: true },
  { name: 'Painting', key: 'painting', durationDays: 7, isCritical: false },
  { name: 'MEP Fixtures', key: 'mep fixtures', durationDays: 5, isCritical: false },
  { name: 'Soft Furnishing', key: 'soft furnishing', durationDays: 4, isCritical: false },
  { name: 'Cleanup & Handover', key: 'cleanup', durationDays: 3, isCritical: true },
];

export default function TimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  const [activeTab, setActiveTab] = useState('gantt');

  const { data: schedules = [], isLoading } = trpc.schedule.getByProject.useQuery({ projectId });

  const generateSchedule = trpc.schedule.generate.useMutation({
    onSuccess: () => {
      utils.schedule.getByProject.invalidate({ projectId });
      toast({ title: 'Schedule generation started', description: 'This may take a few moments.' });
    },
    onError: () => {
      toast({ title: 'Generation failed', description: 'Could not start schedule generation.', variant: 'destructive' });
    },
  });

  const currentSchedule: any = schedules[0];

  // Build Gantt tasks from trade sequence as preview data
  const previewTasks = useMemo(() => {
    const today = new Date();
    let currentDate = new Date(today);
    return TRADE_SEQUENCE.map((trade, idx) => {
      const startDate = new Date(currentDate);
      const endDate = new Date(currentDate);
      endDate.setDate(endDate.getDate() + trade.durationDays);
      currentDate = new Date(endDate);

      return {
        id: `preview-${idx}`,
        name: trade.name,
        trade: trade.key,
        startDate: startDate.toISOString().split('T')[0]!,
        endDate: endDate.toISOString().split('T')[0]!,
        progress: 0,
        isCritical: trade.isCritical,
        isMilestone: false,
        dependencies: idx > 0 ? [`preview-${idx - 1}`] : [],
      };
    });
  }, []);

  // Build Gantt tasks from actual schedule milestones
  const scheduleTasks = useMemo(() => {
    const ms_list = (currentSchedule as any)?.milestones as Record<string, unknown>[] | undefined;
    if (!ms_list?.length) return [];
    return ms_list.map((ms, idx) => ({
      id: ms.id as string,
      name: (ms.name as string) || `Milestone ${idx + 1}`,
      trade: (ms.trade as string) || 'general',
      startDate: ms.startDate ? new Date(ms.startDate as string).toISOString().split('T')[0]! : new Date().toISOString().split('T')[0]!,
      endDate: ms.dueDate ? new Date(ms.dueDate as string).toISOString().split('T')[0]! : new Date().toISOString().split('T')[0]!,
      progress: (ms.status as string) === 'completed' ? 100 : (ms.status as string) === 'in_progress' ? 50 : 0,
      isCritical: (ms.isCritical as boolean) ?? false,
      isMilestone: (ms.isMilestone as boolean) ?? false,
      dependencies: idx > 0 ? [ms_list[idx - 1]!.id as string] : [],
    }));
  }, [currentSchedule]);

  const ganttTasks = scheduleTasks.length > 0 ? scheduleTasks : previewTasks;

  const projectStart = ganttTasks.length > 0 ? ganttTasks[0]!.startDate : new Date().toISOString().split('T')[0]!;
  const projectEnd = ganttTasks.length > 0 ? ganttTasks[ganttTasks.length - 1]!.endDate : new Date().toISOString().split('T')[0]!;

  // Build milestones for the tracker view
  const trackerMilestones = useMemo(() => {
    if ((currentSchedule as any)?.milestones?.length) {
      return ((currentSchedule as any).milestones as Record<string, unknown>[]).map((ms) => ({
        id: ms.id as string,
        name: (ms.name as string) || 'Unnamed Milestone',
        status: (ms.status as string) || 'pending',
        dueDate: ms.dueDate ? new Date(ms.dueDate as string).toISOString() : null,
        completedDate: ms.completedDate ? new Date(ms.completedDate as string).toISOString() : null,
        hasPaymentLink: !!(ms.paymentId as string | undefined),
      }));
    }
    // Preview milestones from trade sequence
    return TRADE_SEQUENCE.map((trade, idx) => ({
      id: `preview-${idx}`,
      name: trade.name,
      status: 'pending',
      dueDate: null,
      completedDate: null,
      hasPaymentLink: idx === 5 || idx === TRADE_SEQUENCE.length - 1,
    }));
  }, [currentSchedule]);

  // Count milestones by status
  const statusCounts = useMemo(() => {
    const counts = { pending: 0, in_progress: 0, completed: 0, overdue: 0 };
    trackerMilestones.forEach((ms) => {
      const status = ms.status as keyof typeof counts;
      if (status in counts) counts[status]++;
    });
    return counts;
  }, [trackerMilestones]);

  // Critical path items
  const criticalPath = ganttTasks.filter((t) => t.isCritical);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Timeline</h1>
          <p className="text-sm text-muted-foreground">
            {currentSchedule
              ? `Schedule created ${new Date(currentSchedule.createdAt as string).toLocaleDateString()}`
              : 'Construction schedule and milestone tracking'}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => generateSchedule.mutate({ projectId })}
          disabled={generateSchedule.isPending}
        >
          <Play className="mr-1 h-4 w-4" />
          {generateSchedule.isPending ? 'Generating...' : 'Generate Schedule'}
        </Button>
      </div>

      {/* Status summary cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                <CalendarDays className="h-5 w-5 text-gray-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{statusCounts.pending}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <BarChart3 className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{statusCounts.in_progress}</p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
                <ListChecks className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{statusCounts.completed}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{statusCounts.overdue}</p>
                <p className="text-xs text-muted-foreground">Overdue</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different views */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="gantt">Gantt Chart</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          <TabsTrigger value="critical">Critical Path</TabsTrigger>
        </TabsList>

        <TabsContent value="gantt" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Construction Schedule</CardTitle>
              <CardDescription>
                {scheduleTasks.length > 0
                  ? 'Schedule generated from project data'
                  : 'Preview of standard trade sequence — generate a schedule for actual data'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GanttChart
                tasks={ganttTasks}
                projectStart={projectStart}
                projectEnd={projectEnd}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="milestones" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Milestone Tracker</CardTitle>
              <CardDescription>Track progress through each construction phase</CardDescription>
            </CardHeader>
            <CardContent>
              <MilestoneTracker milestones={trackerMilestones} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="critical" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Critical Path</CardTitle>
              <CardDescription>
                Tasks on the critical path directly affect the project end date. Any delay here delays the entire project.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {criticalPath.length === 0 ? (
                <p className="text-sm text-muted-foreground">No critical path tasks found.</p>
              ) : (
                <div className="space-y-2">
                  {criticalPath.map((task, idx) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between rounded-lg border border-red-100 bg-red-50/50 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-medium text-red-700">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{task.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {task.trade} &middot; {task.startDate} to {task.endDate}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="text-xs">
                          Critical
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {task.progress}% done
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Trade Sequence Reference */}
      {!currentSchedule && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Standard Trade Sequence</CardTitle>
            <CardDescription>
              The typical order of trades for interior construction projects
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {TRADE_SEQUENCE.map((trade, idx) => (
                <div key={trade.key} className="flex items-center gap-1">
                  <Badge variant={trade.isCritical ? 'destructive' : 'secondary'} className="text-xs">
                    {idx + 1}. {trade.name}
                  </Badge>
                  {idx < TRADE_SEQUENCE.length - 1 && (
                    <span className="text-muted-foreground">&rarr;</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
