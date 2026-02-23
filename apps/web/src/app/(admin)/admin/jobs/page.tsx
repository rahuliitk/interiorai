'use client';

import { useState, useEffect } from 'react';
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
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  toast,
  Separator,
  Progress,
} from '@openlintel/ui';
import {
  ListTodo,
  Search,
  RefreshCw,
  Play,
  Square,
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Timer,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const JOB_TYPES = [
  'all',
  'design_generation',
  'bom_calculation',
  'drawing_generation',
  'cutlist_generation',
  'mep_calculation',
  'media_processing',
  'export',
] as const;

const JOB_STATUSES = [
  'all',
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;

const PAGE_SIZE = 25;

export default function AdminJobsPage() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.admin.listJobs.useQuery(
    {
      type: typeFilter !== 'all' ? typeFilter : undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      search: searchQuery || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    {
      retry: false,
      refetchInterval: autoRefresh ? 5000 : false,
    },
  );

  const cancelJob = trpc.admin.cancelJob.useMutation({
    onSuccess: () => {
      utils.admin.listJobs.invalidate();
      toast({ title: 'Job cancelled' });
    },
    onError: (err) => {
      toast({
        title: 'Failed to cancel job',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const retryJob = trpc.admin.retryJob.useMutation({
    onSuccess: () => {
      utils.admin.listJobs.invalidate();
      toast({ title: 'Job requeued' });
    },
    onError: (err) => {
      toast({
        title: 'Failed to retry job',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const jobs = data?.jobs ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const queuedCount = data?.queuedCount ?? 0;
  const runningCount = data?.runningCount ?? 0;
  const failedCount = data?.failedCount ?? 0;

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'queued':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'cancelled':
        return <Square className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const statusBadgeVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'running':
        return 'secondary';
      case 'failed':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Job Queue</h1>
          <p className="text-muted-foreground">
            Monitor and manage background processing jobs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Jobs</p>
                <p className="text-2xl font-bold">{totalCount}</p>
              </div>
              <ListTodo className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Queued</p>
                <p className="text-2xl font-bold text-yellow-600">{queuedCount}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Running</p>
                <p className="text-2xl font-bold text-blue-600">{runningCount}</p>
              </div>
              <Loader2 className="h-8 w-8 text-blue-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-red-600">{failedCount}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="search-jobs">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="search-jobs"
                  placeholder="Search by job ID or user..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(0);
                  }}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-[180px] space-y-2">
              <Label>Job Type</Label>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JOB_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type === 'all' ? 'All Types' : type.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[150px] space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JOB_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status === 'all' ? 'All Statuses' : status.charAt(0).toUpperCase() + status.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Jobs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListTodo className="h-4 w-4" />
            Jobs
            {!isLoading && (
              <Badge variant="secondary" className="ml-2">
                {totalCount}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {totalPages > 1
              ? `Page ${page + 1} of ${totalPages}`
              : `${totalCount} job${totalCount !== 1 ? 's' : ''}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No jobs found matching your filters.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Job ID
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Type
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        User
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Progress
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Created
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Duration
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job: {
                      id: string;
                      type: string;
                      status: string;
                      userName: string;
                      progress: number;
                      createdAt: string;
                      durationMs?: number;
                      error?: string;
                    }) => (
                      <tr
                        key={job.id}
                        className="border-b last:border-0 hover:bg-muted/50"
                      >
                        <td className="px-3 py-3 font-mono text-xs">
                          {job.id.slice(0, 8)}...
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="outline" className="text-xs">
                            {job.type.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            {statusIcon(job.status)}
                            <Badge
                              variant={statusBadgeVariant(job.status)}
                              className="text-xs"
                            >
                              {job.status}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {job.userName}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2 w-32">
                            <Progress value={job.progress} className="h-2 flex-1" />
                            <span className="text-xs text-muted-foreground w-8 text-right">
                              {job.progress}%
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(job.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Timer className="h-3 w-3" />
                            {job.durationMs ? formatDuration(job.durationMs) : '—'}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {(job.status === 'queued' || job.status === 'running') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title="Cancel job"
                                onClick={() => {
                                  if (confirm('Cancel this job?')) {
                                    cancelJob.mutate({ jobId: job.id });
                                  }
                                }}
                              >
                                <Square className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            )}
                            {job.status === 'failed' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title="Retry job"
                                onClick={() => retryJob.mutate({ jobId: job.id })}
                              >
                                <RotateCcw className="h-3.5 w-3.5 text-blue-500" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <>
                  <Separator className="my-4" />
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Showing {page * PAGE_SIZE + 1}–
                      {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {page + 1} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
