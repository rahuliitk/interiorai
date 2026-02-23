'use client';

import { useMemo } from 'react';
import { cn } from '@openlintel/ui';

interface CategoryCost {
  category: string;
  total: number;
}

interface BOMCategorySummaryProps {
  categories: CategoryCost[];
  currency?: string;
}

const BAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-indigo-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-lime-500',
  'bg-stone-500',
];

function formatCurrency(value: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyDetailed(value: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

export function BOMCategorySummary({ categories, currency = 'USD' }: BOMCategorySummaryProps) {
  const grandTotal = useMemo(
    () => categories.reduce((sum, c) => sum + c.total, 0),
    [categories],
  );

  const sorted = useMemo(
    () => [...categories].sort((a, b) => b.total - a.total),
    [categories],
  );

  const maxTotal = useMemo(
    () => Math.max(...sorted.map((c) => c.total), 1),
    [sorted],
  );

  if (categories.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
        No category data available.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Grand total */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Total Estimated Cost</p>
        <p className="text-3xl font-bold tracking-tight">
          {formatCurrencyDetailed(grandTotal, currency)}
        </p>
      </div>

      {/* Horizontal bar chart */}
      <div className="space-y-3">
        {sorted.map((cat, idx) => {
          const percentage = grandTotal > 0 ? (cat.total / grandTotal) * 100 : 0;
          const barWidth = (cat.total / maxTotal) * 100;
          const barColor = BAR_COLORS[idx % BAR_COLORS.length];

          return (
            <div key={cat.category} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {cat.category
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground tabular-nums">
                    {percentage.toFixed(1)}%
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(cat.total, currency)}
                  </span>
                </div>
              </div>
              <div className="h-3 w-full rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', barColor)}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Percentage breakdown chips */}
      <div className="flex flex-wrap gap-2 pt-2">
        {sorted.map((cat, idx) => {
          const percentage = grandTotal > 0 ? (cat.total / grandTotal) * 100 : 0;
          const barColor = BAR_COLORS[idx % BAR_COLORS.length];

          return (
            <div
              key={cat.category}
              className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
            >
              <div className={cn('h-2 w-2 rounded-full', barColor)} />
              <span>
                {cat.category
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase())}
              </span>
              <span className="font-medium tabular-nums">{percentage.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
