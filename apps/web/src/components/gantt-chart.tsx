'use client';

import { useMemo } from 'react';
import { Badge } from '@openlintel/ui';
import { Diamond } from 'lucide-react';

interface GanttTask {
  id: string;
  name: string;
  trade: string;
  startDate: string;
  endDate: string;
  progress: number;
  isCritical?: boolean;
  isMilestone?: boolean;
  dependencies?: string[];
}

interface GanttChartProps {
  tasks: GanttTask[];
  projectStart: string;
  projectEnd: string;
}

const TRADE_COLORS: Record<string, string> = {
  demolition: 'bg-red-500',
  civil: 'bg-stone-500',
  'plumbing rough-in': 'bg-blue-500',
  'electrical rough-in': 'bg-yellow-500',
  'false ceiling': 'bg-purple-500',
  flooring: 'bg-amber-600',
  carpentry: 'bg-orange-500',
  painting: 'bg-pink-500',
  'mep fixtures': 'bg-cyan-500',
  'soft furnishing': 'bg-emerald-500',
  cleanup: 'bg-green-600',
};

function getTradeColor(trade: string): string {
  return TRADE_COLORS[trade.toLowerCase()] || 'bg-gray-500';
}

function daysBetween(d1: string, d2: string): number {
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  return Math.ceil((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function GanttChart({ tasks, projectStart, projectEnd }: GanttChartProps) {
  const totalDays = useMemo(() => daysBetween(projectStart, projectEnd), [projectStart, projectEnd]);

  const today = new Date().toISOString().split('T')[0];
  const todayOffset = useMemo(() => {
    const days = daysBetween(projectStart, today);
    return Math.max(0, Math.min(100, (days / totalDays) * 100));
  }, [projectStart, today, totalDays]);

  const weekMarkers = useMemo(() => {
    const markers: { label: string; position: number }[] = [];
    const start = new Date(projectStart);
    for (let i = 0; i <= totalDays; i += 7) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      markers.push({
        label: formatDate(date.toISOString()),
        position: (i / totalDays) * 100,
      });
    }
    return markers;
  }, [projectStart, totalDays]);

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed p-12 text-muted-foreground">
        No schedule tasks to display. Generate a schedule to see the Gantt chart.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        {/* Header with week markers */}
        <div className="relative mb-1 flex h-8 items-end border-b">
          <div className="w-48 shrink-0 px-2 text-xs font-medium text-muted-foreground">Task</div>
          <div className="relative flex-1">
            {weekMarkers.map((marker, idx) => (
              <div
                key={idx}
                className="absolute bottom-0 text-[10px] text-muted-foreground"
                style={{ left: `${marker.position}%`, transform: 'translateX(-50%)' }}
              >
                {marker.label}
              </div>
            ))}
          </div>
        </div>

        {/* Tasks */}
        <div className="space-y-1">
          {tasks.map((task) => {
            const startOffset = (daysBetween(projectStart, task.startDate) / totalDays) * 100;
            const duration = (daysBetween(task.startDate, task.endDate) / totalDays) * 100;

            return (
              <div key={task.id} className="group flex items-center">
                {/* Task label */}
                <div className="w-48 shrink-0 truncate px-2 py-1">
                  <span className="text-xs font-medium">{task.name}</span>
                  {task.isCritical && (
                    <Badge variant="destructive" className="ml-1 px-1 py-0 text-[9px]">
                      Critical
                    </Badge>
                  )}
                </div>

                {/* Bar area */}
                <div className="relative h-8 flex-1">
                  {/* Grid lines */}
                  {weekMarkers.map((marker, idx) => (
                    <div
                      key={idx}
                      className="absolute top-0 h-full border-l border-dashed border-gray-100"
                      style={{ left: `${marker.position}%` }}
                    />
                  ))}

                  {/* Today marker */}
                  <div
                    className="absolute top-0 z-10 h-full w-0.5 bg-red-400"
                    style={{ left: `${todayOffset}%` }}
                  />

                  {task.isMilestone ? (
                    /* Milestone diamond */
                    <div
                      className="absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${startOffset}%` }}
                    >
                      <Diamond className="h-4 w-4 fill-amber-400 text-amber-600" />
                    </div>
                  ) : (
                    /* Task bar */
                    <div
                      className={`absolute top-1 h-6 rounded ${task.isCritical ? 'ring-2 ring-red-300' : ''}`}
                      style={{ left: `${startOffset}%`, width: `${Math.max(duration, 0.5)}%` }}
                    >
                      {/* Background */}
                      <div className={`absolute inset-0 rounded ${getTradeColor(task.trade)} opacity-30`} />
                      {/* Progress fill */}
                      <div
                        className={`absolute inset-y-0 left-0 rounded-l ${getTradeColor(task.trade)}`}
                        style={{ width: `${task.progress}%` }}
                      />
                      {/* Label inside bar */}
                      <span className="relative z-10 flex h-full items-center px-1 text-[10px] font-medium text-white drop-shadow-sm">
                        {duration > 5 ? task.trade : ''}
                      </span>
                    </div>
                  )}

                  {/* Dependency arrows (simple lines) */}
                  {task.dependencies?.map((depId) => {
                    const depTask = tasks.find((t) => t.id === depId);
                    if (!depTask) return null;
                    const depEnd = (daysBetween(projectStart, depTask.endDate) / totalDays) * 100;
                    return (
                      <svg
                        key={`${depId}-${task.id}`}
                        className="absolute top-0 left-0 h-full w-full pointer-events-none"
                        style={{ overflow: 'visible' }}
                      >
                        <line
                          x1={`${depEnd}%`}
                          y1="50%"
                          x2={`${startOffset}%`}
                          y2="50%"
                          stroke="#9ca3af"
                          strokeWidth="1"
                          strokeDasharray="3,3"
                          markerEnd="url(#arrowhead)"
                        />
                        <defs>
                          <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                            <polygon points="0 0, 6 2, 0 4" fill="#9ca3af" />
                          </marker>
                        </defs>
                      </svg>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-3 border-t pt-3">
          {Object.entries(TRADE_COLORS).map(([trade, color]) => (
            <div key={trade} className="flex items-center gap-1">
              <div className={`h-3 w-3 rounded ${color}`} />
              <span className="text-[10px] capitalize text-muted-foreground">{trade}</span>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <div className="h-0.5 w-3 bg-red-400" />
            <span className="text-[10px] text-muted-foreground">Today</span>
          </div>
          <div className="flex items-center gap-1">
            <Diamond className="h-3 w-3 fill-amber-400 text-amber-600" />
            <span className="text-[10px] text-muted-foreground">Milestone</span>
          </div>
        </div>
      </div>
    </div>
  );
}
