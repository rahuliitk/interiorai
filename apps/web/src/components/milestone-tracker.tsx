'use client';

import { Badge } from '@openlintel/ui';
import {
  Circle,
  CheckCircle2,
  Clock,
  AlertCircle,
  CreditCard,
} from 'lucide-react';

interface Milestone {
  id: string;
  name: string;
  status: string;
  dueDate: string | null;
  completedDate?: string | null;
  hasPaymentLink?: boolean;
}

interface MilestoneTrackerProps {
  milestones: Milestone[];
  onMilestoneClick?: (milestone: Milestone) => void;
}

const STATUS_CONFIG: Record<string, {
  icon: typeof Circle;
  color: string;
  badgeVariant: 'secondary' | 'default' | 'destructive' | 'outline';
  label: string;
}> = {
  pending: {
    icon: Circle,
    color: 'text-gray-400',
    badgeVariant: 'secondary',
    label: 'Pending',
  },
  in_progress: {
    icon: Clock,
    color: 'text-blue-500',
    badgeVariant: 'default',
    label: 'In Progress',
  },
  completed: {
    icon: CheckCircle2,
    color: 'text-green-500',
    badgeVariant: 'outline',
    label: 'Completed',
  },
  overdue: {
    icon: AlertCircle,
    color: 'text-red-500',
    badgeVariant: 'destructive',
    label: 'Overdue',
  },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No date set';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function MilestoneTracker({ milestones, onMilestoneClick }: MilestoneTrackerProps) {
  if (milestones.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
        No milestones defined yet.
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-[15px] top-0 h-full w-0.5 bg-gray-200" />

      <div className="space-y-6">
        {milestones.map((milestone, idx) => {
          const config = STATUS_CONFIG[milestone.status] || STATUS_CONFIG.pending;
          const StatusIcon = config.icon;

          return (
            <div
              key={milestone.id}
              className="relative flex gap-4 cursor-pointer group"
              onClick={() => onMilestoneClick?.(milestone)}
            >
              {/* Icon */}
              <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white">
                <StatusIcon className={`h-5 w-5 ${config.color}`} />
              </div>

              {/* Content */}
              <div className="flex-1 rounded-lg border p-3 transition-colors group-hover:border-primary/30 group-hover:bg-gray-50/50">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{milestone.name}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Due: {formatDate(milestone.dueDate)}</span>
                      {milestone.completedDate && (
                        <span className="text-green-600">
                          Completed: {formatDate(milestone.completedDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {milestone.hasPaymentLink && (
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                    )}
                    <Badge variant={config.badgeVariant} className="text-xs">
                      {config.label}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
