'use client';

import { use, useMemo } from 'react';
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
  ArrowLeft,
  BarChart3,
  IndianRupee,
  Layers,
  Palette,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { CostBreakdownChart, type CostCategory } from '@/components/analytics/cost-breakdown-chart';
import { TimelineProgress, type Milestone } from '@/components/analytics/timeline-progress';
import { BudgetVsActual, type BudgetItem } from '@/components/analytics/budget-vs-actual';

// Demo data generators (will be replaced by real tRPC data when the analytics API is built)
function generateCostBreakdown(roomCount: number): CostCategory[] {
  const base = [
    { name: 'Furniture', amount: 185000, color: '#3b82f6' },
    { name: 'Flooring', amount: 95000, color: '#10b981' },
    { name: 'Wall Finishes', amount: 62000, color: '#f59e0b' },
    { name: 'Lighting', amount: 48000, color: '#8b5cf6' },
    { name: 'Plumbing Fixtures', amount: 35000, color: '#06b6d4' },
    { name: 'Electrical', amount: 28000, color: '#f97316' },
    { name: 'Soft Furnishings', amount: 42000, color: '#ec4899' },
    { name: 'Hardware', amount: 18000, color: '#14b8a6' },
    { name: 'Decorative', amount: 22000, color: '#a855f7' },
    { name: 'Ceiling', amount: 15000, color: '#ef4444' },
  ];
  // Scale slightly by room count
  const factor = Math.max(1, roomCount * 0.8);
  return base.map((c) => ({
    ...c,
    amount: Math.round(c.amount * factor),
  }));
}

function generateMilestones(): Milestone[] {
  const today = new Date();
  const start = new Date(today);
  start.setMonth(start.getMonth() - 2);

  return [
    {
      id: 'm1',
      name: 'Design Approval',
      date: new Date(start.getTime() + 14 * 86400000).toISOString(),
      completed: true,
    },
    {
      id: 'm2',
      name: 'Material Procurement',
      date: new Date(start.getTime() + 35 * 86400000).toISOString(),
      completed: true,
    },
    {
      id: 'm3',
      name: 'Civil Work Complete',
      date: new Date(start.getTime() + 56 * 86400000).toISOString(),
      completed: true,
    },
    {
      id: 'm4',
      name: 'Furniture Installation',
      date: new Date(start.getTime() + 77 * 86400000).toISOString(),
      completed: false,
    },
    {
      id: 'm5',
      name: 'Final Handover',
      date: new Date(start.getTime() + 98 * 86400000).toISOString(),
      completed: false,
    },
  ];
}

function generateBudgetItems(): BudgetItem[] {
  return [
    { name: 'Furniture', budgeted: 200000, actual: 185000 },
    { name: 'Flooring', budgeted: 90000, actual: 95000 },
    { name: 'Wall Finishes', budgeted: 70000, actual: 62000 },
    { name: 'Lighting', budgeted: 50000, actual: 48000 },
    { name: 'Plumbing', budgeted: 30000, actual: 35000 },
    { name: 'Electrical', budgeted: 25000, actual: 28000 },
    { name: 'Soft Furnishings', budgeted: 40000, actual: 42000 },
    { name: 'Decorative', budgeted: 20000, actual: 22000 },
  ];
}

export default function ProjectAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: project, isLoading: loadingProject } = trpc.project.byId.useQuery({ id });
  const { data: variants = [], isLoading: loadingVariants } = trpc.designVariant.listByProject.useQuery({ projectId: id });

  const roomCount = project?.rooms?.length ?? 0;

  const costCategories = useMemo(() => generateCostBreakdown(roomCount), [roomCount]);
  const milestones = useMemo(() => generateMilestones(), []);
  const budgetItems = useMemo(() => generateBudgetItems(), []);

  const today = new Date();
  const startDate = new Date(today);
  startDate.setMonth(startDate.getMonth() - 2);
  const endDate = new Date(today);
  endDate.setMonth(endDate.getMonth() + 1);

  if (loadingProject || loadingVariants) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!project) {
    return <p className="text-muted-foreground">Project not found.</p>;
  }

  const totalCost = costCategories.reduce((s, c) => s + c.amount, 0);
  const totalBudget = budgetItems.reduce((s, i) => s + i.budgeted, 0);
  const totalActual = budgetItems.reduce((s, i) => s + i.actual, 0);

  // Group variants by style
  const styleCount: Record<string, number> = {};
  variants.forEach((v) => {
    styleCount[v.style] = (styleCount[v.style] || 0) + 1;
  });
  const styleEntries = Object.entries(styleCount).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/project/${id}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to project
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Project Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Costs, timeline, and design analysis for {project.name}.
        </p>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-950">
                <IndianRupee className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Cost</p>
                <p className="text-lg font-bold">
                  {new Intl.NumberFormat('en-IN', {
                    style: 'currency',
                    currency: 'INR',
                    maximumFractionDigits: 0,
                  }).format(totalCost)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-100 p-2 dark:bg-green-950">
                {totalBudget >= totalActual ? (
                  <TrendingDown className="h-5 w-5 text-green-600" />
                ) : (
                  <TrendingUp className="h-5 w-5 text-red-600" />
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Budget Variance</p>
                <p
                  className={`text-lg font-bold ${
                    totalBudget >= totalActual ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {totalBudget >= totalActual ? 'Under' : 'Over'} by{' '}
                  {Math.abs(
                    ((totalBudget - totalActual) / totalBudget) * 100,
                  ).toFixed(1)}
                  %
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-100 p-2 dark:bg-violet-950">
                <Layers className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rooms</p>
                <p className="text-lg font-bold">{roomCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-950">
                <Palette className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Design Variants</p>
                <p className="text-lg font-bold">{variants.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <CostBreakdownChart
          categories={costCategories}
          title="Cost Breakdown by Category"
          description="Estimated material and labour costs"
        />
        <BudgetVsActual
          items={budgetItems}
          title="Budget vs Actual Spending"
          description="Track spending against planned budget"
        />
      </div>

      {/* Timeline */}
      <div className="mb-6">
        <TimelineProgress
          startDate={startDate.toISOString()}
          endDate={endDate.toISOString()}
          milestones={milestones}
          completionPercent={62}
          title="Schedule Progress"
        />
      </div>

      {/* Materials breakdown & Design variant comparison */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Materials breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Materials Breakdown</CardTitle>
            <CardDescription>Top material categories by cost</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {costCategories
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 6)
                .map((cat) => {
                  const pct = (cat.amount / totalCost) * 100;
                  return (
                    <div key={cat.name} className="flex items-center gap-3">
                      <div
                        className="h-3 w-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="flex-1 text-sm">{cat.name}</span>
                      <div className="w-24">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: cat.color,
                            }}
                          />
                        </div>
                      </div>
                      <span className="w-16 text-right text-xs text-muted-foreground">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        {/* Design variant comparison */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Design Variant Comparison</CardTitle>
            <CardDescription>
              {variants.length} variant{variants.length !== 1 ? 's' : ''} across {roomCount} room
              {roomCount !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {variants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No design variants yet. Create variants to see comparisons.
              </p>
            ) : (
              <div className="space-y-4">
                {/* Style distribution */}
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Styles Used
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {styleEntries.map(([style, count]) => (
                      <Badge key={style} variant="secondary">
                        {style} ({count})
                      </Badge>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Variant list with budget tiers */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Variants</p>
                  {variants.map((variant) => {
                    const tierColors: Record<string, string> = {
                      economy: 'bg-green-100 text-green-700',
                      standard: 'bg-blue-100 text-blue-700',
                      premium: 'bg-violet-100 text-violet-700',
                      luxury: 'bg-amber-100 text-amber-700',
                    };
                    return (
                      <div
                        key={variant.id}
                        className="flex items-center justify-between rounded-lg border p-2.5"
                      >
                        <div>
                          <p className="text-sm font-medium">{variant.name}</p>
                          <p className="text-xs text-muted-foreground">{variant.roomName}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">
                            {variant.style}
                          </Badge>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                              tierColors[variant.budgetTier] || 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {variant.budgetTier}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
