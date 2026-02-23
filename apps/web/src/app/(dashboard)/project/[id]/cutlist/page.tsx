'use client';

import { use, useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import { CutListTable, HardwareScheduleTable, type CutListPanel, type HardwareItem } from '@/components/cutlist-table';
import { NestingViewer, type NestingSheet } from '@/components/nesting-viewer';
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  toast,
} from '@openlintel/ui';
import {
  Scissors,
  Download,
  FileDown,
  RefreshCw,
  Loader2,
  LayoutGrid,
  Wrench,
  BarChart3,
} from 'lucide-react';

export default function CutListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  const [generateOpen, setGenerateOpen] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState('');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const { data: variants = [], isLoading: loadingVariants } =
    trpc.designVariant.listByProject.useQuery({ projectId });
  const { data: cutlistResults = [], isLoading: loadingCutlist } =
    trpc.cutlist.listByProject.useQuery({ projectId });

  const generateCutlist = trpc.cutlist.generate.useMutation({
    onSuccess: (job) => {
      setActiveJobId(job.id);
      setGenerateOpen(false);
      toast({ title: 'Cut list generation started' });
    },
    onError: (err) => {
      toast({ title: 'Failed to start cut list generation', description: err.message });
    },
  });

  const { data: jobStatus } = trpc.cutlist.jobStatus.useQuery(
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
      utils.cutlist.listByProject.invalidate({ projectId });
      setActiveJobId(null);
      toast({ title: 'Cut list generation complete' });
    } else if (jobStatus?.status === 'failed') {
      setActiveJobId(null);
      toast({ title: 'Cut list generation failed', description: jobStatus.error || 'Unknown error' });
    }
  }, [jobStatus?.status, projectId, utils.cutlist.listByProject, jobStatus?.error]);

  const handleGenerate = () => {
    if (!selectedVariant) return;
    generateCutlist.mutate({ designVariantId: selectedVariant });
  };

  // Parse data from the most recent result
  const latestResult = cutlistResults.length > 0 ? cutlistResults[0] : null;
  const panels: CutListPanel[] = latestResult?.panels
    ? (latestResult.panels as CutListPanel[])
    : [];
  const hardware: HardwareItem[] = latestResult?.hardware
    ? (latestResult.hardware as HardwareItem[])
    : [];
  const nestingSheets: NestingSheet[] = latestResult?.nestingResult
    ? (latestResult.nestingResult as NestingSheet[])
    : [];
  const totalSheets = latestResult?.totalSheets || 0;
  const wastePercent = latestResult?.wastePercent || 0;

  const totalPanelQty = panels.reduce((sum, p) => sum + p.quantity, 0);
  const uniqueMaterials = new Set(panels.map((p) => p.material)).size;

  const handleExportDxf = () => {
    if (panels.length === 0) {
      toast({ title: 'No cut list data to export' });
      return;
    }
    toast({ title: 'DXF export', description: 'CNC-ready DXF export requires the cutlist service.' });
  };

  const handleExportCsv = () => {
    if (panels.length === 0) {
      toast({ title: 'No cut list data to export' });
      return;
    }
    const headers = ['Part Name', 'Furniture Unit', 'Length', 'Width', 'Thickness', 'Material', 'Grain', 'Edge T', 'Edge B', 'Edge L', 'Edge R', 'Qty'];
    const rows = panels.map((p) => [
      p.partName,
      p.furnitureUnit,
      p.length.toString(),
      p.width.toString(),
      p.thickness.toString(),
      p.material,
      p.grain,
      p.edgeBanding.top ? 'Y' : 'N',
      p.edgeBanding.bottom ? 'Y' : 'N',
      p.edgeBanding.left ? 'Y' : 'N',
      p.edgeBanding.right ? 'Y' : 'N',
      p.quantity.toString(),
    ]);
    const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cutlist-${projectId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'CSV exported' });
  };

  if (loadingVariants || loadingCutlist) {
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
          <h1 className="text-2xl font-bold tracking-tight">Cut List</h1>
          <p className="text-sm text-muted-foreground">
            CNC-ready panel cut lists with nesting optimization.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {panels.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={handleExportCsv}>
                <FileDown className="mr-1 h-4 w-4" />
                CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportDxf}>
                <Download className="mr-1 h-4 w-4" />
                DXF (CNC)
              </Button>
            </>
          )}
          <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={variants.length === 0 || Boolean(activeJobId)}>
                {activeJobId ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-4 w-4" />
                )}
                Generate Cut List
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate Cut List</DialogTitle>
                <DialogDescription>
                  Select a design variant to generate a cut list from. This will calculate
                  panel dimensions, nesting layouts, and hardware schedules.
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
                  disabled={generateCutlist.isPending || !selectedVariant}
                >
                  {generateCutlist.isPending ? 'Starting...' : 'Generate'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Job progress */}
      {activeJobId && jobStatus && (
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium">Generating cut list...</span>
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

      {/* Cut list content */}
      {panels.length > 0 ? (
        <div className="space-y-6">
          {/* Stats summary */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Unique Parts</p>
                <p className="text-2xl font-bold">{panels.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Total Panels</p>
                <p className="text-2xl font-bold">{totalPanelQty}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Sheets Required</p>
                <p className="text-2xl font-bold">{totalSheets}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Waste</p>
                <p className={`text-2xl font-bold ${wastePercent > 25 ? 'text-red-600' : wastePercent > 15 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {wastePercent.toFixed(1)}%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Metadata */}
          {latestResult && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>
                Generated: {new Date(latestResult.createdAt).toLocaleDateString()}
              </span>
              {'variantName' in latestResult && (
                <>
                  <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                  <span>Variant: {(latestResult as { variantName: string }).variantName}</span>
                </>
              )}
              {'roomName' in latestResult && (
                <>
                  <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                  <span>Room: {(latestResult as { roomName: string }).roomName}</span>
                </>
              )}
              <span className="h-1 w-1 rounded-full bg-muted-foreground" />
              <span>{uniqueMaterials} material{uniqueMaterials !== 1 ? 's' : ''}</span>
            </div>
          )}

          <Separator />

          {/* Tabbed content */}
          <Tabs defaultValue="panels">
            <TabsList>
              <TabsTrigger value="panels">
                <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />
                Panels ({panels.length})
              </TabsTrigger>
              <TabsTrigger value="nesting">
                <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
                Nesting ({totalSheets} sheets)
              </TabsTrigger>
              <TabsTrigger value="hardware">
                <Wrench className="mr-1.5 h-3.5 w-3.5" />
                Hardware ({hardware.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="panels" className="mt-4">
              <CutListTable panels={panels} />
            </TabsContent>

            <TabsContent value="nesting" className="mt-4">
              <NestingViewer sheets={nestingSheets} />
            </TabsContent>

            <TabsContent value="hardware" className="mt-4">
              <HardwareScheduleTable items={hardware} />
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        /* Empty state */
        <div className="space-y-6">
          {variants.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cut List Status by Design Variant</CardTitle>
                <CardDescription>
                  {variants.length} variant{variants.length !== 1 ? 's' : ''} available for cut list generation
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
              <Scissors className="mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-lg font-semibold">No Design Variants</h2>
              <p className="text-sm text-muted-foreground">
                Create design variants in the Designs tab first. Cut lists will be generated from each variant.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
