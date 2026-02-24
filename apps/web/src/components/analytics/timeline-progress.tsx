'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge } from '@openlintel/ui';
import { cn } from '@openlintel/ui';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

export interface Milestone {
  id: string;
  name: string;
  /** Date as ISO string or timestamp. */
  date: string;
  /** Completion: 0-100. */
  completed: boolean;
}

interface TimelineProgressProps {
  startDate: string;
  endDate: string;
  milestones: Milestone[];
  /** Overall completion percentage (0-100). */
  completionPercent: number;
  title?: string;
}

function daysBetween(a: string, b: string): number {
  const msDay = 86400000;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msDay);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function TimelineProgress({
  startDate,
  endDate,
  milestones,
  completionPercent,
  title = 'Project Timeline',
}: TimelineProgressProps) {
  const today = new Date().toISOString().split('T')[0];
  const totalDays = daysBetween(startDate, endDate);
  const elapsedDays = daysBetween(startDate, today);
  const remainingDays = daysBetween(today, endDate);
  const timePercent = totalDays > 0 ? Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100)) : 0;

  const isOverdue = remainingDays < 0;
  const isAhead = completionPercent > timePercent;

  // Position milestones on the timeline
  const milestonePositions = milestones.map((m) => {
    const daysSinceStart = daysBetween(startDate, m.date);
    const position = totalDays > 0 ? Math.min(100, Math.max(0, (daysSinceStart / totalDays) * 100)) : 0;
    return { ...m, position };
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>
              {formatDate(startDate)} - {formatDate(endDate)}
            </CardDescription>
          </div>
          <Badge
            variant={isOverdue ? 'destructive' : isAhead ? 'default' : 'secondary'}
          >
            {isOverdue
              ? `${Math.abs(remainingDays)} days overdue`
              : `${remainingDays} days remaining`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Completion</span>
            <span className="text-sm font-bold">{completionPercent}%</span>
          </div>
          <div className="relative h-4 w-full overflow-hidden rounded-full bg-muted">
            {/* Actual progress */}
            <div
              className={cn(
                'absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out',
                isOverdue ? 'bg-red-500' : isAhead ? 'bg-green-500' : 'bg-primary',
              )}
              style={{ width: `${completionPercent}%` }}
            />
            {/* Time marker */}
            <div
              className="absolute top-0 h-full w-0.5 bg-foreground/30"
              style={{ left: `${timePercent}%` }}
              title={`Today: ${timePercent.toFixed(0)}% of timeline elapsed`}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {isAhead ? (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  Ahead of schedule
                </span>
              ) : isOverdue ? (
                <span className="flex items-center gap-1 text-red-600">
                  <AlertTriangle className="h-3 w-3" />
                  Behind schedule
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  On track
                </span>
              )}
            </span>
            <span>{timePercent.toFixed(0)}% of time elapsed</span>
          </div>
        </div>

        {/* Milestones on timeline */}
        {milestonePositions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Milestones</p>
            <div className="relative h-8">
              {/* Timeline bar */}
              <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-border" />

              {/* Milestone dots */}
              {milestonePositions.map((m) => (
                <div
                  key={m.id}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${m.position}%` }}
                  title={`${m.name} — ${formatDate(m.date)}`}
                >
                  <div
                    className={cn(
                      'h-4 w-4 rounded-full border-2 border-background',
                      m.completed ? 'bg-green-500' : 'bg-muted-foreground',
                    )}
                  />
                </div>
              ))}

              {/* Today marker */}
              <div
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${timePercent}%` }}
              >
                <div className="h-5 w-5 rounded-full border-2 border-primary bg-primary/20" />
              </div>
            </div>

            {/* Milestone list */}
            <div className="space-y-1">
              {milestonePositions.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'h-2 w-2 rounded-full',
                        m.completed ? 'bg-green-500' : 'bg-muted-foreground',
                      )}
                    />
                    <span className={m.completed ? 'line-through text-muted-foreground' : ''}>
                      {m.name}
                    </span>
                  </div>
                  <span className="text-muted-foreground">{formatDate(m.date)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
