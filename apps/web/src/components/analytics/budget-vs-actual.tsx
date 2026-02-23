'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@openlintel/ui';
import { cn } from '@openlintel/ui';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface BudgetItem {
  name: string;
  budgeted: number;
  actual: number;
}

interface BudgetVsActualProps {
  items: BudgetItem[];
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

export function BudgetVsActual({
  items,
  currency = 'INR',
  title = 'Budget vs Actual',
  description,
}: BudgetVsActualProps) {
  const totalBudget = items.reduce((sum, item) => sum + item.budgeted, 0);
  const totalActual = items.reduce((sum, item) => sum + item.actual, 0);
  const totalVariance = totalBudget - totalActual;
  const totalVariancePct = totalBudget > 0 ? (totalVariance / totalBudget) * 100 : 0;

  // Max value for scaling bars
  const maxValue = Math.max(...items.flatMap((i) => [i.budgeted, i.actual]), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary row */}
        <div className="grid grid-cols-3 gap-4 rounded-lg border p-3">
          <div>
            <p className="text-xs text-muted-foreground">Budget</p>
            <p className="text-lg font-bold">{formatCurrency(totalBudget, currency)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Actual</p>
            <p className="text-lg font-bold">{formatCurrency(totalActual, currency)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Variance</p>
            <div className="flex items-center gap-1">
              {totalVariance > 0 ? (
                <TrendingDown className="h-4 w-4 text-green-600" />
              ) : totalVariance < 0 ? (
                <TrendingUp className="h-4 w-4 text-red-600" />
              ) : (
                <Minus className="h-4 w-4 text-muted-foreground" />
              )}
              <p
                className={cn(
                  'text-lg font-bold',
                  totalVariance > 0
                    ? 'text-green-600'
                    : totalVariance < 0
                      ? 'text-red-600'
                      : '',
                )}
              >
                {totalVariance >= 0 ? '' : '-'}
                {formatCurrency(Math.abs(totalVariance), currency)}
              </p>
            </div>
            <p
              className={cn(
                'text-xs',
                totalVariance > 0
                  ? 'text-green-600'
                  : totalVariance < 0
                    ? 'text-red-600'
                    : 'text-muted-foreground',
              )}
            >
              {totalVariancePct >= 0 ? 'Under' : 'Over'} by {Math.abs(totalVariancePct).toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Individual items */}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No budget data available.</p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const variance = item.budgeted - item.actual;
              const variancePct =
                item.budgeted > 0 ? (variance / item.budgeted) * 100 : 0;
              const budgetWidth = (item.budgeted / maxValue) * 100;
              const actualWidth = (item.actual / maxValue) * 100;
              const isOver = variance < 0;

              return (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{item.name}</span>
                    <span
                      className={cn(
                        'text-xs font-medium',
                        isOver ? 'text-red-600' : 'text-green-600',
                      )}
                    >
                      {isOver ? '+' : '-'}
                      {Math.abs(variancePct).toFixed(1)}%
                    </span>
                  </div>

                  {/* Budget bar */}
                  <div className="flex items-center gap-2">
                    <span className="w-14 text-right text-xs text-muted-foreground">Budget</span>
                    <div className="flex-1">
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-blue-400 transition-all duration-500"
                          style={{ width: `${budgetWidth}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-20 text-right text-xs">
                      {formatCurrency(item.budgeted, currency)}
                    </span>
                  </div>

                  {/* Actual bar */}
                  <div className="flex items-center gap-2">
                    <span className="w-14 text-right text-xs text-muted-foreground">Actual</span>
                    <div className="flex-1">
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            isOver ? 'bg-red-400' : 'bg-green-400',
                          )}
                          style={{ width: `${actualWidth}%` }}
                        />
                      </div>
                    </div>
                    <span
                      className={cn(
                        'w-20 text-right text-xs font-medium',
                        isOver ? 'text-red-600' : 'text-green-600',
                      )}
                    >
                      {formatCurrency(item.actual, currency)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 border-t pt-3">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-blue-400" />
            <span className="text-xs text-muted-foreground">Budget</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
            <span className="text-xs text-muted-foreground">Under budget</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="text-xs text-muted-foreground">Over budget</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
