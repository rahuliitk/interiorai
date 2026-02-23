'use client';

import { use, useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import { BOMTable, type BOMItem } from '@/components/bom-table';
import { BOMCategorySummary } from '@/components/bom-category-summary';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Skeleton,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Progress,
  Separator,
  toast,
} from '@openlintel/ui';
import {
  ShoppingCart,
  Download,
  FileSpreadsheet,
  FileText,
  FileDown,
  RefreshCw,
  Loader2,
} from 'lucide-react';

export default function BOMPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  const [generateOpen, setGenerateOpen] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState('');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const { data: variants = [], isLoading: loadingVariants } =
    trpc.designVariant.listByProject.useQuery({ projectId });
  const { data: bomResults = [], isLoading: loadingBom } =
    trpc.bom.listByProject.useQuery({ projectId });

  const generateBom = trpc.bom.generate.useMutation({
    onSuccess: (job) => {
      setActiveJobId(job.id);
      setGenerateOpen(false);
      toast({ title: 'BOM generation started' });
    },
    onError: (err) => {
      toast({ title: 'Failed to start BOM generation', description: err.message });
    },
  });

  const { data: jobStatus } = trpc.bom.jobStatus.useQuery(
    { jobId: activeJobId! },
    {
      enabled: Boolean(activeJobId),
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === 'completed' || status === 'failed') return false;
        return 2000;
      },
    },
  );

  useEffect(() => {
    if (jobStatus?.status === 'completed') {
      utils.bom.listByProject.invalidate({ projectId });
      setActiveJobId(null);
      toast({ title: 'BOM generation complete' });
    } else if (jobStatus?.status === 'failed') {
      setActiveJobId(null);
      toast({ title: 'BOM generation failed', description: jobStatus.error || 'Unknown error' });
    }
  }, [jobStatus?.status, projectId, utils.bom.listByProject, jobStatus?.error]);

  const handleGenerate = () => {
    if (!selectedVariant) return;
    generateBom.mutate({ designVariantId: selectedVariant });
  };

  // Parse BOM items from the most recent result
  const latestBom = bomResults.length > 0 ? bomResults[0] : null;
  const bomItems: BOMItem[] = latestBom?.items
    ? (latestBom.items as BOMItem[])
    : [];

  const categoryData = bomItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + item.total;
    return acc;
  }, {});

  const categorySummary = Object.entries(categoryData).map(([category, total]) => ({
    category,
    total,
  }));

  const currency = latestBom?.currency || 'USD';

  const handleExport = (format: 'csv' | 'excel' | 'pdf') => {
    if (bomItems.length === 0) {
      toast({ title: 'No BOM data to export' });
      return;
    }

    if (format === 'csv') {
      const headers = ['Item', 'Category', 'Specification', 'Quantity', 'Unit', 'Unit Price', 'Total', 'Waste Factor'];
      const rows = bomItems.map((item) => [
        item.name,
        item.category,
        item.specification,
        item.quantity.toString(),
        item.unit,
        item.unitPrice.toFixed(2),
        item.total.toFixed(2),
        (item.wasteFactor * 100).toFixed(1) + '%',
      ]);
      const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bom-${projectId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'CSV exported' });
    } else if (latestBom) {
      const exportFormat = format === 'excel' ? 'xlsx' : 'pdf';
      window.open(`/api/bom/export/${latestBom.id}?format=${exportFormat}`, '_blank');
      toast({ title: `${format.toUpperCase()} export started` });
    }
  };

  if (loadingVariants || loadingBom) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bill of Materials</h1>
          <p className="text-sm text-muted-foreground">
            Auto-generated material lists with quantities and costs.
            {bomResults.length > 0 && (
              <> {bomResults.length} BOM{bomResults.length !== 1 ? 's' : ''} generated.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Export buttons */}
          {bomItems.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
                <FileDown className="mr-1 h-4 w-4" />
                CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>
                <FileSpreadsheet className="mr-1 h-4 w-4" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>
                <FileText className="mr-1 h-4 w-4" />
                PDF
              </Button>
            </>
          )}

          {/* Generate BOM dialog */}
          <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={variants.length === 0 || Boolean(activeJobId)}>
                {activeJobId ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-4 w-4" />
                )}
                Generate BOM
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate Bill of Materials</DialogTitle>
                <DialogDescription>
                  Select a design variant to generate a BOM from. This will calculate
                  material quantities and costs based on the design.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Select value={selectedVariant} onValueChange={setSelectedVariant}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select design variant" />
                    </SelectTrigger>
                    <SelectContent>
                      {variants.map((variant) => (
                        <SelectItem key={variant.id} value={variant.id}>
                          {variant.name} ({variant.roomName})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGenerateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={generateBom.isPending || !selectedVariant}
                >
                  {generateBom.isPending ? 'Starting...' : 'Generate'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Job progress indicator */}
      {activeJobId && jobStatus && (
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium">Generating BOM...</span>
              </div>
              <Badge variant="secondary" className="text-xs">
                {jobStatus.status}
              </Badge>
            </div>
            <Progress value={jobStatus.progress || 0} />
            <p className="mt-1 text-xs text-muted-foreground">
              {jobStatus.progress || 0}% complete
            </p>
          </CardContent>
        </Card>
      )}

      {/* BOM content */}
      {bomItems.length > 0 ? (
        <div className="space-y-6">
          {/* Category cost breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cost Breakdown by Category</CardTitle>
              <CardDescription>
                Material cost distribution across {categorySummary.length} categories
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BOMCategorySummary categories={categorySummary} currency={currency} />
            </CardContent>
          </Card>

          <Separator />

          {/* BOM metadata */}
          {latestBom && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>
                Generated: {new Date(latestBom.createdAt).toLocaleDateString()}
              </span>
              {'variantName' in latestBom && (
                <>
                  <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                  <span>Variant: {(latestBom as { variantName: string }).variantName}</span>
                </>
              )}
              {'roomName' in latestBom && (
                <>
                  <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                  <span>Room: {(latestBom as { roomName: string }).roomName}</span>
                </>
              )}
            </div>
          )}

          {/* Full BOM table */}
          <BOMTable items={bomItems} currency={currency} />
        </div>
      ) : (
        /* Empty state */
        <div className="space-y-6">
          {/* Variant status */}
          {variants.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">BOM Status by Design Variant</CardTitle>
                <CardDescription>
                  {variants.length} variant{variants.length !== 1 ? 's' : ''} available for BOM generation
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
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={Boolean(activeJobId)}
                        onClick={() => {
                          setSelectedVariant(variant.id);
                          setGenerateOpen(true);
                        }}
                      >
                        Generate
                      </Button>
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
      )}
    </div>
  );
}
