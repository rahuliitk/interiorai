'use client';

import { use } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Skeleton,
} from '@openlintel/ui';
import { ShoppingCart, AlertCircle } from 'lucide-react';

const MATERIAL_CATEGORIES = [
  'Flooring',
  'Wall Finishes',
  'Ceiling',
  'Furniture',
  'Lighting',
  'Plumbing Fixtures',
  'Electrical',
  'Hardware',
  'Decorative',
  'Soft Furnishings',
];

const BOM_COLUMNS = ['Item', 'Specification', 'Qty', 'Unit', 'Unit Price', 'Total'];

export default function BOMPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);

  const { data: variants = [], isLoading } = trpc.designVariant.listByProject.useQuery({ projectId });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Bill of Materials</h1>
        <p className="text-sm text-muted-foreground">
          Auto-generated material lists with quantities and costs.
        </p>
      </div>

      <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/50">
        <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            BOM calculation requires the bom-engine service
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            This feature will be available when the bom-engine microservice is deployed.
          </p>
        </div>
      </div>

      {/* Material categories preview */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Material Categories</CardTitle>
          <CardDescription>BOM items will be organized into these categories</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {MATERIAL_CATEGORIES.map((cat) => (
              <Badge key={cat} variant="secondary">
                {cat}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Table header preview */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">BOM Table Preview</CardTitle>
          <CardDescription>Each design variant will generate a detailed BOM</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  {BOM_COLUMNS.map((col) => (
                    <th key={col} className="px-3 py-2 text-left font-medium text-muted-foreground">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    colSpan={BOM_COLUMNS.length}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    BOM data will appear here once the bom-engine generates calculations.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Variant status */}
      {variants.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">BOM Status by Design Variant</CardTitle>
            <CardDescription>
              {variants.length} variant{variants.length !== 1 ? 's' : ''} awaiting BOM calculation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {variants.map((variant) => (
                <div
                  key={variant.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{variant.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {variant.roomName} &middot; {variant.style} &middot; {variant.budgetTier}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Pending calculation
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <ShoppingCart className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">No Design Variants</h2>
          <p className="text-sm text-muted-foreground">
            Create design variants in the Designs tab first. BOM will be calculated from each variant.
          </p>
        </Card>
      )}
    </div>
  );
}
