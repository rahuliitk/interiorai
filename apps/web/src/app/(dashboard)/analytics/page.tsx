'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Skeleton,
  Separator,
} from '@openlintel/ui';
import {
  BarChart3,
  FolderKanban,
  CheckCircle2,
  Clock,
  IndianRupee,
  TrendingUp,
  Palette,
  Layers,
} from 'lucide-react';

/** CSS bar chart row. */
function BarRow({
  label,
  value,
  maxValue,
  color,
  suffix,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  suffix?: string;
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 truncate text-sm">{label}</span>
      <div className="flex-1">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
      </div>
      <span className="w-16 text-right text-xs font-medium text-muted-foreground">
        {value}
        {suffix}
      </span>
    </div>
  );
}

/** Spending trend (past 6 months). */
function SpendingTrend({ data }: { data: { month: string; amount: number }[] }) {
  const maxAmount = Math.max(...data.map((d) => d.amount), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Spending Trend</CardTitle>
        <CardDescription>Monthly expenditure over the past 6 months</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2" style={{ height: 160 }}>
          {data.map((d) => {
            const heightPct = (d.amount / maxAmount) * 100;
            return (
              <div
                key={d.month}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <span className="text-[10px] font-medium text-muted-foreground">
                  {(d.amount / 1000).toFixed(0)}k
                </span>
                <div className="w-full flex items-end" style={{ height: 120 }}>
                  <div
                    className="w-full rounded-t-sm bg-primary transition-all duration-500"
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{d.month}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function GlobalAnalyticsPage() {
  const { data: overview, isLoading } = trpc.analytics.globalOverview.useQuery();

  if (isLoading || !overview) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const totalSpending = overview.totalSpent;
  const styleEntries = overview.styleDistribution.map(s => [s.name, s.count] as [string, number]);
  const maxStyleCount = Math.max(...styleEntries.map(([, c]) => c), 1);

  const statusEntries = Object.entries(overview.statusCounts) as [string, number][];
  const statusColors: Record<string, string> = {
    draft: '#94a3b8',
    designing: '#3b82f6',
    design_approved: '#8b5cf6',
    procurement: '#f59e0b',
    in_construction: '#f97316',
    completed: '#10b981',
  };

  const budgetColors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b'];
  const maxBudgetVal = Math.max(...overview.budgetDistribution.map((d) => d.value), 1);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Analytics Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of all projects, spending, and design preferences.
        </p>
      </div>

      {/* Overview cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-950">
                <FolderKanban className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Projects</p>
                <p className="text-2xl font-bold">{overview.totalProjects}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-950">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active</p>
                <p className="text-2xl font-bold">{overview.activeProjects}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-100 p-2 dark:bg-green-950">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{overview.completedProjects}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-100 p-2 dark:bg-violet-950">
                <IndianRupee className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Spending</p>
                <p className="text-2xl font-bold">
                  {(totalSpending / 100000).toFixed(1)}L
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 1 */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {/* Spending trend */}
        <SpendingTrend data={overview.spendingTrend as { month: string; amount: number }[]} />

        {/* Project status distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Status Distribution</CardTitle>
            <CardDescription>Breakdown of projects by current status</CardDescription>
          </CardHeader>
          <CardContent>
            {statusEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No projects yet.</p>
            ) : (
              <div className="space-y-3">
                {statusEntries.map(([status, count]) => {
                  const pct =
                    overview.totalProjects > 0 ? (count / overview.totalProjects) * 100 : 0;
                  const color = statusColors[status] || '#94a3b8';
                  return (
                    <div key={status}>
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-sm"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-sm">
                            {status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {count} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Popular design styles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="h-5 w-5" />
              Popular Design Styles
            </CardTitle>
            <CardDescription>Most used styles across all projects</CardDescription>
          </CardHeader>
          <CardContent>
            {styleEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No style data available.</p>
            ) : (
              <div className="space-y-2.5">
                {styleEntries.map(([style, count], i) => {
                  const colors = [
                    '#3b82f6',
                    '#10b981',
                    '#f59e0b',
                    '#8b5cf6',
                    '#ef4444',
                    '#06b6d4',
                  ];
                  return (
                    <BarRow
                      key={style}
                      label={style}
                      value={count}
                      maxValue={maxStyleCount}
                      color={colors[i % colors.length] ?? '#94a3b8'}
                    />
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Budget tier distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-5 w-5" />
              Budget Distribution
            </CardTitle>
            <CardDescription>Projects grouped by budget tier</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {(overview.budgetDistribution as { label: string; value: number }[]).map((tier, i) => (
                <BarRow
                  key={tier.label}
                  label={tier.label}
                  value={tier.value}
                  maxValue={maxBudgetVal}
                  color={budgetColors[i % budgetColors.length] ?? '#94a3b8'}
                  suffix={tier.value === 1 ? ' project' : ' projects'}
                />
              ))}
            </div>

            <Separator className="my-4" />

            {/* Rooms overview */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Rooms</span>
              </div>
              <span className="text-sm font-bold">{overview.totalRooms}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Avg Rooms per Project</span>
              </div>
              <span className="text-sm font-bold">
                {overview.totalProjects > 0
                  ? (overview.totalRooms / overview.totalProjects).toFixed(1)
                  : '0'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
