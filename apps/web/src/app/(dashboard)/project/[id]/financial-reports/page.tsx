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
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Receipt,
  FileText,
  BarChart3,
  PieChart as PieChartIcon,
  Wallet,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  DollarSign,
  Ruler,
  Layers,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from 'recharts';

const PIE_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];

function formatCurrency(value: number): string {
  if (value >= 10000000) {
    return `₹${(value / 10000000).toFixed(2)} Cr`;
  }
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(2)} L`;
  }
  if (value >= 1000) {
    return `₹${(value / 1000).toFixed(1)}K`;
  }
  return `₹${value.toLocaleString('en-IN')}`;
}

function formatFullCurrency(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

function formatDate(dateStr: string | Date): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'paid':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'pending':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    case 'overdue':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'draft':
      return 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400';
    case 'cancelled':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    default:
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  }
}

// ── Custom Recharts Tooltip ────────────────────────────────
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      {payload.map((entry, idx) => (
        <p key={idx} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {formatFullCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

// ── Custom Pie Tooltip ─────────────────────────────────────
function PieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { category: string; amount: number } }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0];
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-sm font-medium">{data.payload.category}</p>
      <p className="text-sm text-muted-foreground">{formatFullCurrency(data.payload.amount)}</p>
    </div>
  );
}

// ── Custom Pie Label ───────────────────────────────────────
function renderCustomLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
}) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      className="text-xs font-medium"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

// ────────────────────────────────────────────────────────────
// Main Page Component
// ────────────────────────────────────────────────────────────
export default function FinancialReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);

  // ── Data fetching ──────────────────────────────────────────
  const {
    data: budgetData,
    isLoading: loadingBudget,
  } = trpc.financialReport.budgetVsActuals.useQuery({ projectId });

  const {
    data: timeline = [],
    isLoading: loadingTimeline,
  } = trpc.financialReport.expenditureTimeline.useQuery({ projectId });

  const {
    data: categoryData = [],
    isLoading: loadingCategory,
  } = trpc.financialReport.categorySpend.useQuery({ projectId });

  const {
    data: sqftData,
    isLoading: loadingSqft,
  } = trpc.financialReport.perSqftCost.useQuery({ projectId });

  const {
    data: invoices = [],
    isLoading: loadingInvoices,
  } = trpc.financialReport.listInvoices.useQuery({ projectId });

  const { data: project, isLoading: loadingProject } = trpc.project.byId.useQuery({
    id: projectId,
  });

  // ── Derived data ───────────────────────────────────────────
  const isLoading =
    loadingBudget ||
    loadingTimeline ||
    loadingCategory ||
    loadingSqft ||
    loadingInvoices ||
    loadingProject;

  const totalSpent = budgetData?.totalPaid ?? 0;
  const budgetRemaining = budgetData?.variance ?? 0;
  const paymentCount = budgetData?.paymentCount ?? 0;
  const costPerSqft = sqftData?.costPerSqft ?? 0;
  const isOverBudget = budgetRemaining < 0;

  const totalCategorySpend = useMemo(
    () => categoryData.reduce((sum, c) => sum + c.amount, 0),
    [categoryData],
  );

  const benchmarkData = useMemo(() => {
    if (!sqftData?.marketBenchmark) return [];
    const benchmarks = sqftData.marketBenchmark;
    return [
      { name: 'Economy', value: benchmarks.economy, fill: '#94a3b8' },
      { name: 'Mid-Range', value: benchmarks.midRange, fill: '#60a5fa' },
      { name: 'Premium', value: benchmarks.premium, fill: '#a78bfa' },
      { name: 'Luxury', value: benchmarks.luxury, fill: '#f472b6' },
      { name: 'Your Project', value: sqftData.costPerSqft, fill: '#10b981' },
    ].sort((a, b) => a.value - b.value);
  }, [sqftData]);

  const maxBenchmark = useMemo(
    () => Math.max(...benchmarkData.map((b) => b.value), 1),
    [benchmarkData],
  );

  // ── Loading state ──────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!project) {
    return <p className="text-muted-foreground">Project not found.</p>;
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────── */}
      <div>
        <Link
          href={`/project/${projectId}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to project
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Financial Reports</h1>
        <p className="text-sm text-muted-foreground">
          Budget analysis, expenditure tracking, and cost benchmarks for{' '}
          <span className="font-medium text-foreground">{project.name}</span>.
        </p>
      </div>

      {/* ── Summary Metrics ─────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Spent */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <IndianRupee className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Spent</p>
                <p className="text-xl font-bold">{formatCurrency(totalSpent)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Budget Remaining */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  isOverBudget
                    ? 'bg-red-100 dark:bg-red-900/30'
                    : 'bg-emerald-100 dark:bg-emerald-900/30'
                }`}
              >
                {isOverBudget ? (
                  <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
                ) : (
                  <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {isOverBudget ? 'Over Budget' : 'Budget Remaining'}
                </p>
                <p
                  className={`text-xl font-bold ${
                    isOverBudget ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {formatCurrency(Math.abs(budgetRemaining))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Count */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Receipt className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Payments</p>
                <p className="text-xl font-bold">{paymentCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cost per Sqft */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Ruler className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cost / sq.ft.</p>
                <p className="text-xl font-bold">
                  {costPerSqft > 0 ? `₹${costPerSqft.toLocaleString('en-IN')}` : 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Budget vs Actuals Card ──────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Budget vs Actuals</CardTitle>
          </div>
          <CardDescription>
            Comparison of estimated budget against actual spend and commitments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Left: budget breakdown bars */}
            <div className="space-y-4">
              {/* Estimated Budget */}
              <div>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Estimated Budget</span>
                  <span className="font-medium">
                    {formatFullCurrency(budgetData?.estimatedBudget ?? 0)}
                  </span>
                </div>
                <div className="h-3 w-full rounded-full bg-muted">
                  <div
                    className="h-3 rounded-full bg-slate-400"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Total Paid */}
              <div>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Paid</span>
                  <span className="font-medium text-emerald-600">
                    {formatFullCurrency(budgetData?.totalPaid ?? 0)}
                  </span>
                </div>
                <div className="h-3 w-full rounded-full bg-muted">
                  <div
                    className="h-3 rounded-full bg-emerald-500"
                    style={{
                      width: `${
                        budgetData?.estimatedBudget
                          ? Math.min(
                              ((budgetData.totalPaid / budgetData.estimatedBudget) * 100),
                              100,
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* Total Pending */}
              <div>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Pending Payments</span>
                  <span className="font-medium text-amber-600">
                    {formatFullCurrency(budgetData?.totalPending ?? 0)}
                  </span>
                </div>
                <div className="h-3 w-full rounded-full bg-muted">
                  <div
                    className="h-3 rounded-full bg-amber-500"
                    style={{
                      width: `${
                        budgetData?.estimatedBudget
                          ? Math.min(
                              ((budgetData.totalPending / budgetData.estimatedBudget) * 100),
                              100,
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* PO Total */}
              <div>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Purchase Orders</span>
                  <span className="font-medium text-blue-600">
                    {formatFullCurrency(budgetData?.totalOrdered ?? 0)}
                  </span>
                </div>
                <div className="h-3 w-full rounded-full bg-muted">
                  <div
                    className="h-3 rounded-full bg-blue-500"
                    style={{
                      width: `${
                        budgetData?.estimatedBudget
                          ? Math.min(
                              (((budgetData?.totalOrdered ?? 0) / budgetData.estimatedBudget) * 100),
                              100,
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Right: variance summary */}
            <div className="flex flex-col items-center justify-center rounded-lg border bg-muted/30 p-6">
              <p className="mb-2 text-sm text-muted-foreground">Budget Variance</p>
              <p
                className={`text-3xl font-bold ${
                  isOverBudget ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {isOverBudget ? '-' : '+'}
                {formatFullCurrency(Math.abs(budgetRemaining))}
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-sm">
                {isOverBudget ? (
                  <>
                    <ArrowDownRight className="h-4 w-4 text-red-500" />
                    <span className="text-red-600 dark:text-red-400">Over budget</span>
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">Under budget</span>
                  </>
                )}
              </div>
              <Separator className="my-4 w-full" />
              <div className="grid w-full grid-cols-2 gap-3 text-center text-sm">
                <div>
                  <p className="text-muted-foreground">Payments</p>
                  <p className="font-semibold">{budgetData?.paymentCount ?? 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Orders</p>
                  <p className="font-semibold">{budgetData?.orderCount ?? 0}</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Charts Row: Timeline + Category Pie ─────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Expenditure Timeline */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Expenditure Timeline</CardTitle>
            </div>
            <CardDescription>
              Monthly spending and cumulative expenditure over time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {timeline.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No payment data available yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeline} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                    tickFormatter={(v) => formatCurrency(v)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    name="Monthly Spend"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulative"
                    name="Cumulative"
                    stroke="#10b981"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Category-wise Spend Pie Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Category-wise Spend</CardTitle>
            </div>
            <CardDescription>
              Distribution of expenditure across different categories.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No categorized payments available yet.
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 md:flex-row">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="amount"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={50}
                      labelLine={false}
                      label={renderCustomLabel}
                    >
                      {categoryData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div className="w-full space-y-2 md:w-48">
                  {categoryData.map((entry, index) => (
                    <div key={entry.category} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{
                            backgroundColor: PIE_COLORS[index % PIE_COLORS.length],
                          }}
                        />
                        <span className="truncate text-muted-foreground">{entry.category}</span>
                      </div>
                      <span className="ml-2 font-medium">{formatCurrency(entry.amount)}</span>
                    </div>
                  ))}
                  <Separator />
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Total</span>
                    <span>{formatCurrency(totalCategorySpend)}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Per-Square-Foot Cost Card ───────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Cost per Square Foot</CardTitle>
          </div>
          <CardDescription>
            Your project cost benchmarked against market ranges.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            {/* Key metrics */}
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Total Area</p>
                <p className="text-2xl font-bold">
                  {sqftData?.totalAreaSqft
                    ? `${sqftData.totalAreaSqft.toLocaleString('en-IN')} sq.ft.`
                    : 'Not set'}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Total Spent</p>
                <p className="text-2xl font-bold">
                  {formatFullCurrency(sqftData?.totalSpent ?? 0)}
                </p>
              </div>
              <div className="rounded-lg border bg-emerald-50 p-4 dark:bg-emerald-900/20">
                <p className="text-xs text-muted-foreground">Cost per sq.ft.</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {costPerSqft > 0
                    ? `₹${costPerSqft.toLocaleString('en-IN')}`
                    : 'N/A'}
                </p>
              </div>
            </div>

            {/* Benchmark bars */}
            <div className="col-span-2 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                Market Benchmark Comparison
              </p>
              {benchmarkData.map((item) => {
                const widthPercent = Math.max((item.value / maxBenchmark) * 100, 2);
                const isProject = item.name === 'Your Project';
                return (
                  <div key={item.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span
                        className={
                          isProject ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                        }
                      >
                        {item.name}
                      </span>
                      <span
                        className={isProject ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'font-medium'}
                      >
                        ₹{item.value.toLocaleString('en-IN')}/sq.ft.
                      </span>
                    </div>
                    <div className="h-4 w-full rounded-full bg-muted">
                      <div
                        className={`h-4 rounded-full transition-all ${
                          isProject ? 'bg-emerald-500' : ''
                        }`}
                        style={{
                          width: `${widthPercent}%`,
                          backgroundColor: isProject ? undefined : item.fill,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Invoice List Table ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Invoices</CardTitle>
            </div>
            <Badge variant="secondary">{invoices.length} total</Badge>
          </div>
          <CardDescription>
            All invoices associated with this project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              <div className="text-center">
                <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p>No invoices have been created yet.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Invoice #</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Vendor</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Amount</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Date</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Due Date</th>
                    <th className="pb-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice: any) => (
                    <tr
                      key={invoice.id}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="py-3 pr-4">
                        <span className="font-mono text-xs">
                          {invoice.invoiceNumber ?? invoice.id?.slice(0, 8) ?? '-'}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {invoice.vendorName ?? invoice.vendor ?? '-'}
                      </td>
                      <td className="py-3 pr-4 font-medium">
                        {formatFullCurrency(invoice.amount ?? invoice.totalAmount ?? 0)}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {invoice.createdAt ? formatDate(invoice.createdAt) : '-'}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {invoice.dueDate ? formatDate(invoice.dueDate) : '-'}
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(
                            invoice.status ?? 'draft',
                          )}`}
                        >
                          {invoice.status === 'paid' && (
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                          )}
                          {invoice.status === 'pending' && (
                            <Clock className="mr-1 h-3 w-3" />
                          )}
                          {invoice.status === 'overdue' && (
                            <AlertTriangle className="mr-1 h-3 w-3" />
                          )}
                          {(invoice.status ?? 'draft').charAt(0).toUpperCase() +
                            (invoice.status ?? 'draft').slice(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Invoice summary footer */}
          {invoices.length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Total Invoiced: </span>
                  <span className="font-semibold">
                    {formatFullCurrency(
                      invoices.reduce(
                        (sum: number, inv: any) =>
                          sum + (inv.amount ?? inv.totalAmount ?? 0),
                        0,
                      ),
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Paid: </span>
                  <span className="font-semibold text-emerald-600">
                    {formatFullCurrency(
                      invoices
                        .filter((inv: any) => inv.status === 'paid')
                        .reduce(
                          (sum: number, inv: any) =>
                            sum + (inv.amount ?? inv.totalAmount ?? 0),
                          0,
                        ),
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Pending: </span>
                  <span className="font-semibold text-amber-600">
                    {formatFullCurrency(
                      invoices
                        .filter((inv: any) => inv.status === 'pending')
                        .reduce(
                          (sum: number, inv: any) =>
                            sum + (inv.amount ?? inv.totalAmount ?? 0),
                          0,
                        ),
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Overdue: </span>
                  <span className="font-semibold text-red-600">
                    {formatFullCurrency(
                      invoices
                        .filter((inv: any) => inv.status === 'overdue')
                        .reduce(
                          (sum: number, inv: any) =>
                            sum + (inv.amount ?? inv.totalAmount ?? 0),
                          0,
                        ),
                    )}
                  </span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
