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
import { FileText, AlertCircle } from 'lucide-react';

const DRAWING_TYPES = [
  { name: 'Floor Plans', description: 'Top-down layout with furniture placement' },
  { name: 'Elevations', description: 'Wall-by-wall interior elevation views' },
  { name: 'Sections', description: 'Cross-section details for built-in elements' },
  { name: 'Electrical', description: 'Switch, socket, and lighting point layout' },
];

export default function DrawingsPage({ params }: { params: Promise<{ id: string }> }) {
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
        <h1 className="text-2xl font-bold tracking-tight">Drawings</h1>
        <p className="text-sm text-muted-foreground">
          Auto-generated technical drawings from design variants.
        </p>
      </div>

      <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/50">
        <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Drawing generation requires the design-engine service
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            This feature will be available when the design-engine microservice is deployed.
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {DRAWING_TYPES.map((type) => (
          <Card key={type.name}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" />
                {type.name}
              </CardTitle>
              <CardDescription className="text-xs">{type.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      {variants.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Drawing Status by Design Variant</CardTitle>
            <CardDescription>
              {variants.length} variant{variants.length !== 1 ? 's' : ''} awaiting drawing generation
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
                    <p className="text-xs text-muted-foreground">{variant.roomName}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Pending generation
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">No Design Variants</h2>
          <p className="text-sm text-muted-foreground">
            Create design variants in the Designs tab first. Drawings will be generated from each variant.
          </p>
        </Card>
      )}
    </div>
  );
}
