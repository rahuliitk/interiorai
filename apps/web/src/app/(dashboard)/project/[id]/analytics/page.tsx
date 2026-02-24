'use client';

import { use } from 'react';
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
  IndianRupee,
  Layers,
  Palette,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { CostBreakdownChart, type CostCategory } from '@/components/analytics/cost-breakdown-chart';
import { TimelineProgress, type Milestone } from '@/components/analytics/timeline-progress';
import { BudgetVsActual, type BudgetItem } from '@/components/analytics/budget-vs-actual';

export default function ProjectAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: project, isLoading: loadingProject } = trpc.project.byId.useQuery({ id });
  const { data: variants = [], isLoading: loadingVariants } = trpc.designVariant.listByProject.useQuery({ projectId: id });
  const { data: overview, isLoading: loadingOverview } = trpc.analytics.projectOverview.useQuery({ projectId: id });

  if (loadingProject || loadingVariants || loadingOverview) {
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

  const totalCost = overview?.totalCost ?? 0;
  const costCategories: CostCategory[] = (overview?.costBreakdown ?? []).map((c: any) => ({
    ...c,
    color: c.color ?? '#94a3b8',
  }));
  const milestonesData: Milestone[] = overview?.milestones ?? [];
  const budgetItems: BudgetItem[] = overview?.budgetItems ?? [];
  const completionPercent = overview?.completionPercent ?? 0;
  const roomCount = overview?.roomCount ?? 0;
  const variantCount = overview?.variantCount ?? variants.length;

  const totalBudget = budgetItems.reduce((s, i) => s + i.budgeted, 0);
  const totalActual = budgetItems.reduce((s, i) => s + i.actual, 0);

  const startDate = overview?.startDate ?? new Date().toISOString();
  const endDate = overview?.endDate ?? new Date().toISOString();

  // Group variants by style
  const styleCount: Record<string, number> = {};
  variants.forEach((v: { style: string }) => {
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
                  {totalBudget > 0
                    ? Math.abs(
                        ((totalBudget - totalActual) / totalBudget) * 100,
                      ).toFixed(1)
                    : '0.0'}
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
                <p className="text-lg font-bold">{variantCount}</p>
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
          startDate={startDate}
          endDate={endDate}
          milestones={milestonesData}
          completionPercent={completionPercent}
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
                  const pct = totalCost > 0 ? (cat.amount / totalCost) * 100 : 0;
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
                  {variants.map((variant: any) => {
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
