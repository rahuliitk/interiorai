'use client';

import { use, useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import { DrawingPreview } from '@/components/drawing-preview';
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
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Progress,
  toast,
} from '@openlintel/ui';
import {
  FileText,
  Download,
  RefreshCw,
  Loader2,
  Image as ImageIcon,
  FileDown,
} from 'lucide-react';
import { cn } from '@openlintel/ui';

const DRAWING_TYPES = [
  { id: 'floor_plan', label: 'Floor Plan', description: 'Top-down layout with walls and openings' },
  { id: 'furnished_plan', label: 'Furnished Plan', description: 'Floor plan with furniture placement' },
  { id: 'elevation', label: 'Elevation', description: 'Wall-by-wall interior elevation views' },
  { id: 'section', label: 'Section', description: 'Cross-section details for built-in elements' },
  { id: 'rcp', label: 'RCP', description: 'Reflected ceiling plan with lighting layout' },
  { id: 'electrical_layout', label: 'Electrical', description: 'Switch, socket, and lighting point layout' },
  { id: 'flooring_layout', label: 'Flooring', description: 'Flooring pattern and tile layout' },
] as const;

const DRAWING_TYPE_COLORS: Record<string, string> = {
  floor_plan: 'bg-blue-100 text-blue-800',
  furnished_plan: 'bg-emerald-100 text-emerald-800',
  elevation: 'bg-purple-100 text-purple-800',
  section: 'bg-orange-100 text-orange-800',
  rcp: 'bg-teal-100 text-teal-800',
  electrical_layout: 'bg-yellow-100 text-yellow-800',
  flooring_layout: 'bg-amber-100 text-amber-800',
};

export default function DrawingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  const [generateOpen, setGenerateOpen] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([
    'floor_plan',
    'furnished_plan',
    'elevation',
    'electrical_layout',
  ]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [previewDrawing, setPreviewDrawing] = useState<string | null>(null);

  const { data: variants = [], isLoading: loadingVariants } =
    trpc.designVariant.listByProject.useQuery({ projectId });
  const { data: drawings = [], isLoading: loadingDrawings } =
    trpc.drawing.listByProject.useQuery({ projectId });

  const generateDrawings = trpc.drawing.generate.useMutation({
    onSuccess: (job) => {
      setActiveJobId(job.id);
      setGenerateOpen(false);
      toast({ title: 'Drawing generation started' });
    },
    onError: (err) => {
      toast({ title: 'Failed to start drawing generation', description: err.message });
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
      utils.drawing.listByProject.invalidate({ projectId });
      setActiveJobId(null);
      toast({ title: 'Drawing generation complete' });
    } else if (jobStatus?.status === 'failed') {
      setActiveJobId(null);
      toast({ title: 'Drawing generation failed', description: jobStatus.error || 'Unknown error' });
    }
  }, [jobStatus?.status, projectId, utils.drawing.listByProject, jobStatus?.error]);

  const toggleDrawingType = (typeId: string) => {
    setSelectedTypes((prev) =>
      prev.includes(typeId) ? prev.filter((t) => t !== typeId) : [...prev, typeId],
    );
  };

  const handleGenerate = () => {
    if (!selectedVariant || selectedTypes.length === 0) return;
    generateDrawings.mutate({
      designVariantId: selectedVariant,
      drawingTypes: selectedTypes,
    });
  };

  const getDownloadUrl = (storageKey: string | null) => {
    if (!storageKey) return null;
    return `/api/uploads/${encodeURIComponent(storageKey)}`;
  };

  if (loadingVariants || loadingDrawings) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  const previewDrawingData = previewDrawing
    ? drawings.find((d) => d.id === previewDrawing)
    : null;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Drawings</h1>
          <p className="text-sm text-muted-foreground">
            Auto-generated technical drawings from design variants.
            {drawings.length > 0 && (
              <> {drawings.length} drawing{drawings.length !== 1 ? 's' : ''} generated.</>
            )}
          </p>
        </div>
        <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={variants.length === 0 || Boolean(activeJobId)}>
              {activeJobId ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-4 w-4" />
              )}
              Generate Drawings
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Generate Drawings</DialogTitle>
              <DialogDescription>
                Select a design variant and drawing types to generate.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Design Variant</Label>
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
              <div className="space-y-2">
                <Label>Drawing Types</Label>
                <div className="grid grid-cols-2 gap-2">
                  {DRAWING_TYPES.map((type) => {
                    const isSelected = selectedTypes.includes(type.id);
                    return (
                      <button
                        key={type.id}
                        onClick={() => toggleDrawingType(type.id)}
                        className={cn(
                          'flex flex-col rounded-lg border p-3 text-left transition-colors',
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/50',
                        )}
                      >
                        <span className="text-sm font-medium">{type.label}</span>
                        <span className="text-xs text-muted-foreground">{type.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setGenerateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={generateDrawings.isPending || !selectedVariant || selectedTypes.length === 0}
              >
                {generateDrawings.isPending ? 'Starting...' : `Generate ${selectedTypes.length} Drawing${selectedTypes.length !== 1 ? 's' : ''}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Job progress */}
      {activeJobId && jobStatus && (
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium">Generating drawings...</span>
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

      {/* Drawing preview dialog */}
      <Dialog open={Boolean(previewDrawing)} onOpenChange={() => setPreviewDrawing(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {previewDrawingData?.drawingType
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Drawing Preview'}
            </DialogTitle>
            <DialogDescription>
              {'variantName' in (previewDrawingData || {})
                ? `${(previewDrawingData as { variantName: string }).variantName} - ${(previewDrawingData as { roomName: string }).roomName}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {previewDrawingData && (
            <DrawingPreview
              svgUrl={getDownloadUrl(previewDrawingData.svgStorageKey)}
              drawingType={previewDrawingData.drawingType}
              title={previewDrawingData.drawingType
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase())}
              roomName={'roomName' in previewDrawingData ? (previewDrawingData as { roomName: string }).roomName : undefined}
              variantName={'variantName' in previewDrawingData ? (previewDrawingData as { variantName: string }).variantName : undefined}
              date={previewDrawingData.createdAt as unknown as string}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Drawing cards */}
      {drawings.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {drawings.map((drawing) => {
            const svgUrl = getDownloadUrl(drawing.svgStorageKey);
            const dxfUrl = getDownloadUrl(drawing.dxfStorageKey);
            const pdfUrl = getDownloadUrl(drawing.pdfStorageKey);

            return (
              <Card key={drawing.id} className="overflow-hidden">
                {/* SVG thumbnail */}
                <button
                  className="flex aspect-video w-full items-center justify-center bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => setPreviewDrawing(drawing.id)}
                >
                  {svgUrl ? (
                    <img
                      src={svgUrl}
                      alt={drawing.drawingType}
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
                  )}
                </button>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-sm">
                        {drawing.drawingType
                          .replace(/_/g, ' ')
                          .replace(/\b\w/g, (c) => c.toUpperCase())}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {'roomName' in drawing ? (drawing as { roomName: string }).roomName : ''}{' '}
                        {'variantName' in drawing ? `- ${(drawing as { variantName: string }).variantName}` : ''}
                      </CardDescription>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn('text-xs', DRAWING_TYPE_COLORS[drawing.drawingType] || '')}
                    >
                      {drawing.drawingType.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-1.5">
                    {dxfUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        asChild
                      >
                        <a href={dxfUrl} download>
                          <FileDown className="mr-1 h-3 w-3" />
                          DXF
                        </a>
                      </Button>
                    )}
                    {pdfUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        asChild
                      >
                        <a href={pdfUrl} download>
                          <Download className="mr-1 h-3 w-3" />
                          PDF
                        </a>
                      </Button>
                    )}
                    {svgUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        asChild
                      >
                        <a href={svgUrl} download>
                          <Download className="mr-1 h-3 w-3" />
                          SVG
                        </a>
                      </Button>
                    )}
                    {!dxfUrl && !pdfUrl && !svgUrl && (
                      <span className="text-xs text-muted-foreground">
                        No downloads available
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(drawing.createdAt).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* Empty state */
        <div className="space-y-6">
          {/* Drawing types overview */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DRAWING_TYPES.slice(0, 4).map((type) => (
              <Card key={type.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4" />
                    {type.label}
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
                  {variants.length} variant{variants.length !== 1 ? 's' : ''} available for drawing generation
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
              <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-lg font-semibold">No Design Variants</h2>
              <p className="text-sm text-muted-foreground">
                Create design variants in the Designs tab first. Drawings will be generated from each variant.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
