'use client';

import { useState, useMemo, Fragment } from 'react';
import { Badge } from '@openlintel/ui';
import { ChevronDown, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@openlintel/ui';

export interface BOMItem {
  id: string;
  name: string;
  specification: string;
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  wasteFactor: number;
}

type SortField = 'name' | 'quantity' | 'unitPrice' | 'total' | 'wasteFactor';
type SortDir = 'asc' | 'desc';

const CATEGORY_COLORS: Record<string, string> = {
  civil: 'bg-stone-100 text-stone-700 border-stone-300',
  flooring: 'bg-amber-100 text-amber-700 border-amber-300',
  painting: 'bg-purple-100 text-purple-700 border-purple-300',
  electrical: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  plumbing: 'bg-blue-100 text-blue-700 border-blue-300',
  carpentry: 'bg-orange-100 text-orange-700 border-orange-300',
  furniture: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  hardware: 'bg-gray-100 text-gray-700 border-gray-300',
  lighting: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  decorative: 'bg-pink-100 text-pink-700 border-pink-300',
  soft_furnishings: 'bg-rose-100 text-rose-700 border-rose-300',
  wall_finishes: 'bg-teal-100 text-teal-700 border-teal-300',
  ceiling: 'bg-indigo-100 text-indigo-700 border-indigo-300',
};

function formatCurrency(value: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function getCategoryColor(category: string): string {
  const key = category.toLowerCase().replace(/\s+/g, '_');
  return CATEGORY_COLORS[key] || 'bg-gray-100 text-gray-700 border-gray-300';
}

interface BOMTableProps {
  items: BOMItem[];
  currency?: string;
}

export function BOMTable({ items, currency = 'USD' }: BOMTableProps) {
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const grouped = useMemo(() => {
    const groups: Record<string, BOMItem[]> = {};
    for (const item of items) {
      const cat = item.category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }

    // Sort items within each group
    for (const cat of Object.keys(groups)) {
      groups[cat].sort((a, b) => {
        let cmp = 0;
        if (sortField === 'name') cmp = a.name.localeCompare(b.name);
        else if (sortField === 'quantity') cmp = a.quantity - b.quantity;
        else if (sortField === 'unitPrice') cmp = a.unitPrice - b.unitPrice;
        else if (sortField === 'total') cmp = a.total - b.total;
        else if (sortField === 'wasteFactor') cmp = a.wasteFactor - b.wasteFactor;
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return groups;
  }, [items, sortField, sortDir]);

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const [cat, catItems] of Object.entries(grouped)) {
      totals[cat] = catItems.reduce((sum, item) => sum + item.total, 0);
    }
    return totals;
  }, [grouped]);

  const grandTotal = useMemo(
    () => Object.values(categoryTotals).reduce((sum, t) => sum + t, 0),
    [categoryTotals],
  );

  const categories = Object.keys(grouped).sort();

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground/50" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="w-8 px-3 py-2" />
            <th
              className="cursor-pointer px-3 py-2 text-left font-medium text-muted-foreground hover:text-foreground"
              onClick={() => toggleSort('name')}
            >
              <span className="inline-flex items-center">
                Item
                <SortIcon field="name" />
              </span>
            </th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
              Specification
            </th>
            <th
              className="cursor-pointer px-3 py-2 text-right font-medium text-muted-foreground hover:text-foreground"
              onClick={() => toggleSort('quantity')}
            >
              <span className="inline-flex items-center justify-end">
                Qty
                <SortIcon field="quantity" />
              </span>
            </th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Unit</th>
            <th
              className="cursor-pointer px-3 py-2 text-right font-medium text-muted-foreground hover:text-foreground"
              onClick={() => toggleSort('unitPrice')}
            >
              <span className="inline-flex items-center justify-end">
                Unit Price
                <SortIcon field="unitPrice" />
              </span>
            </th>
            <th
              className="cursor-pointer px-3 py-2 text-right font-medium text-muted-foreground hover:text-foreground"
              onClick={() => toggleSort('total')}
            >
              <span className="inline-flex items-center justify-end">
                Total
                <SortIcon field="total" />
              </span>
            </th>
            <th
              className="cursor-pointer px-3 py-2 text-right font-medium text-muted-foreground hover:text-foreground"
              onClick={() => toggleSort('wasteFactor')}
            >
              <span className="inline-flex items-center justify-end">
                Waste %
                <SortIcon field="wasteFactor" />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => {
            const isCollapsed = collapsedCategories.has(category);
            const catItems = grouped[category];
            const catTotal = categoryTotals[category];

            return (
              <Fragment key={category}>
                {/* Category header row */}
                <tr
                  className="cursor-pointer border-b bg-muted/30 hover:bg-muted/50"
                  onClick={() => toggleCategory(category)}
                >
                  <td className="px-3 py-2">
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </td>
                  <td colSpan={5} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn('text-xs', getCategoryColor(category))}
                      >
                        {category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        ({catItems.length} item{catItems.length !== 1 ? 's' : ''})
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {formatCurrency(catTotal, currency)}
                  </td>
                  <td className="px-3 py-2" />
                </tr>

                {/* Item rows */}
                {!isCollapsed &&
                  catItems.map((item) => (
                    <tr key={item.id} className="border-b hover:bg-muted/20">
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 font-medium">{item.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{item.specification}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                      <td className="px-3 py-2 text-muted-foreground">{item.unit}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(item.unitPrice, currency)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {formatCurrency(item.total, currency)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {(item.wasteFactor * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
              </Fragment>
            );
          })}

          {/* Grand total row */}
          <tr className="border-t-2 bg-muted/50 font-bold">
            <td className="px-3 py-3" />
            <td className="px-3 py-3" colSpan={5}>
              Grand Total
            </td>
            <td className="px-3 py-3 text-right tabular-nums text-lg">
              {formatCurrency(grandTotal, currency)}
            </td>
            <td className="px-3 py-3" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

