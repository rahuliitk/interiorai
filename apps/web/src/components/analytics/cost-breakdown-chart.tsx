'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@openlintel/ui';
import { cn } from '@openlintel/ui';

export interface CostCategory {
  name: string;
  amount: number;
  color: string;
}

interface CostBreakdownChartProps {
  categories: CostCategory[];
  currency?: string;
  title?: string;
  description?: string;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const DEFAULT_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
  '#a855f7', // purple
];

export function CostBreakdownChart({
  categories,
  currency = 'INR',
  title = 'Cost Breakdown',
  description,
}: CostBreakdownChartProps) {
  const total = categories.reduce((sum, cat) => sum + cat.amount, 0);

  // Assign default colours if none provided
  const categoriesWithColors = categories.map((cat, i) => ({
    ...cat,
    color: cat.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }));

  // Sort by amount descending
  const sorted = [...categoriesWithColors].sort((a, b) => b.amount - a.amount);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <p className="text-lg font-bold">{formatCurrency(total, currency)}</p>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cost data available.</p>
        ) : (
          <div className="space-y-3">
            {sorted.map((cat) => {
              const percentage = total > 0 ? (cat.amount / total) * 100 : 0;
              return (
                <div key={cat.name}>
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-sm"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-sm">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {formatCurrency(cat.amount, currency)}
                      </span>
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: cat.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Mini legend */}
        {sorted.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3">
            {sorted.map((cat) => (
              <div key={cat.name} className="flex items-center gap-1.5">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="text-[10px] text-muted-foreground">{cat.name}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
