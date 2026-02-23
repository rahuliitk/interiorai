'use client';

import { useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Progress, Badge, Skeleton } from '@openlintel/ui';
import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';

type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

interface JobProgressProps {
  jobId: string;
  onComplete?: () => void;
  onFailed?: (error?: string) => void;
  showDetails?: boolean;
}

const STATUS_CONFIG: Record<
  JobStatus,
  { label: string; icon: React.ElementType; variant: 'default' | 'secondary' | 'outline' | 'destructive'; color: string }
> = {
  pending: {
    label: 'Pending',
    icon: Clock,
    variant: 'outline',
    color: 'text-muted-foreground',
  },
  running: {
    label: 'Running',
    icon: Loader2,
    variant: 'default',
    color: 'text-primary',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    variant: 'secondary',
    color: 'text-green-600',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    variant: 'destructive',
    color: 'text-destructive',
  },
  cancelled: {
    label: 'Cancelled',
    icon: AlertCircle,
    variant: 'outline',
    color: 'text-muted-foreground',
  },
};

export function JobProgress({
  jobId,
  onComplete,
  onFailed,
  showDetails = true,
}: JobProgressProps) {
  const { data: job, isLoading } = trpc.bom.jobStatus.useQuery(
    { jobId },
    {
      refetchInterval: (query) => {
        const status = query.state.data?.status as JobStatus | undefined;
        // Poll every 2 seconds while pending or running
        if (status === 'pending' || status === 'running') {
          return 2000;
        }
        return false;
      },
    },
  );

  const status = (job?.status ?? 'pending') as JobStatus;
  const progress = job?.progress ?? 0;
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const StatusIcon = config.icon;

  // Call onComplete/onFailed when status changes
  useEffect(() => {
    if (status === 'completed') {
      onComplete?.();
    } else if (status === 'failed') {
      onFailed?.(job?.error ?? undefined);
    }
  }, [status, job?.error, onComplete, onFailed]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon
            className={`h-4 w-4 ${config.color} ${
              status === 'running' ? 'animate-spin' : ''
            }`}
          />
          <span className={`text-sm font-medium ${config.color}`}>
            {config.label}
          </span>
        </div>
        <Badge variant={config.variant} className="text-xs">
          {progress}%
        </Badge>
      </div>

      <Progress value={progress} />

      {showDetails && (
        <div className="space-y-1">
          {status === 'pending' && (
            <p className="text-xs text-muted-foreground">
              Waiting in queue...
            </p>
          )}
          {status === 'running' && (
            <p className="text-xs text-muted-foreground">
              Processing... This may take a few minutes.
            </p>
          )}
          {status === 'completed' && (
            <p className="text-xs text-green-600">
              Job completed successfully.
            </p>
          )}
          {status === 'failed' && job?.error && (
            <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 p-2">
              <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
              <p className="text-xs text-destructive">{job.error}</p>
            </div>
          )}
          {status === 'cancelled' && (
            <p className="text-xs text-muted-foreground">
              Job was cancelled.
            </p>
          )}
          {job?.createdAt && (
            <p className="text-xs text-muted-foreground">
              Started: {new Date(job.createdAt).toLocaleString()}
            </p>
          )}
          {job?.completedAt && (
            <p className="text-xs text-muted-foreground">
              Completed: {new Date(job.completedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
