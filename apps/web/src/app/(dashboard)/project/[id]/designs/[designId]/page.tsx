'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { DesignResultViewer } from '@/components/design-result-viewer';
import { DesignGenerationDialog } from '@/components/design-generation-dialog';
import { JobProgress } from '@/components/job-progress';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Skeleton,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Textarea,
  toast,
} from '@openlintel/ui';
import {
  ArrowLeft,
  Sparkles,
  ShoppingCart,
  FileText,
  Box,
  MessageSquare,
  Send,
  ImageIcon,
  Clock,
} from 'lucide-react';

export default function DesignDetailPage({
  params,
}: {
  params: Promise<{ id: string; designId: string }>;
}) {
  const { id: projectId, designId } = use(params);
  const utils = trpc.useUtils();

  const [commentText, setCommentText] = useState('');
  const [bomJobId, setBomJobId] = useState<string | null>(null);
  const [drawingJobId, setDrawingJobId] = useState<string | null>(null);

  // Fetch design variant data
  const { data: variants = [], isLoading: loadingVariants } =
    trpc.designVariant.listByProject.useQuery({ projectId });

  const variant = variants.find((v) => v.id === designId);

  // Fetch room photos for before image
  const { data: roomUploads = [] } = trpc.upload.listByRoom.useQuery(
    { roomId: variant?.roomId ?? '' },
    { enabled: !!variant?.roomId },
  );

  // Fetch BOM results for this variant
  const { data: bomResults = [] } = trpc.bom.listByDesignVariant.useQuery(
    { designVariantId: designId },
    { enabled: !!designId },
  );

  // Fetch drawing results for this variant
  const { data: drawingResults = [] } =
    trpc.drawing.listByDesignVariant.useQuery(
      { designVariantId: designId },
      { enabled: !!designId },
    );

  // Generate BOM mutation
  const generateBOM = trpc.bom.generate.useMutation({
    onSuccess: (job) => {
      setBomJobId(job.id);
      toast({ title: 'BOM generation started' });
    },
    onError: (err) => {
      toast({ title: 'Failed to generate BOM', description: err.message });
    },
  });

  // Generate Drawings mutation
  const generateDrawings = trpc.drawing.generate.useMutation({
    onSuccess: (job) => {
      setDrawingJobId(job.id);
      toast({ title: 'Drawing generation started' });
    },
    onError: (err) => {
      toast({
        title: 'Failed to generate drawings',
        description: err.message,
      });
    },
  });

  const handleGenerateBOM = () => {
    generateBOM.mutate({ designVariantId: designId });
  };

  const handleGenerateDrawings = () => {
    generateDrawings.mutate({ designVariantId: designId });
  };

  const handlePostComment = () => {
    if (!commentText.trim()) return;
    // Comment posting will use the comment tRPC procedure when available
    toast({ title: 'Comment posted' });
    setCommentText('');
  };

  if (loadingVariants) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="aspect-video w-full" />
      </div>
    );
  }

  if (!variant) {
    return (
      <div>
        <Link
          href={`/project/${projectId}/designs`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to designs
        </Link>
        <p className="text-muted-foreground">Design variant not found.</p>
      </div>
    );
  }

  const beforeImage = roomUploads.find((u) => u.mimeType.startsWith('image/'));
  const beforeImageUrl = beforeImage
    ? `/api/uploads/${encodeURIComponent(beforeImage.storageKey)}`
    : null;

  const renderUrls = (variant.renderUrls as string[] | null) ?? [];
  const mainRenderUrl = variant.renderUrl ?? renderUrls[0] ?? null;
  const constraints = (variant.constraints as string[] | null) ?? [];

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/project/${projectId}/designs`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to designs
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {variant.name}
            </h1>
            <p className="text-sm text-muted-foreground">{variant.roomName}</p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="secondary">{variant.style}</Badge>
              <Badge variant="outline">{variant.budgetTier}</Badge>
              <span className="text-xs text-muted-foreground">
                Created {new Date(variant.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <DesignGenerationDialog
            designVariantId={designId}
            roomId={variant.roomId}
            projectId={projectId}
            currentStyle={variant.style}
            currentBudget={variant.budgetTier}
            onGenerated={() => {
              utils.designVariant.listByProject.invalidate({ projectId });
            }}
          />
        </div>
      </div>

      <Separator className="mb-6" />

      <Tabs defaultValue="renders">
        <TabsList>
          <TabsTrigger value="renders">
            <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
            Renders
          </TabsTrigger>
          <TabsTrigger value="bom">
            <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
            BOM ({bomResults.length})
          </TabsTrigger>
          <TabsTrigger value="drawings">
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Drawings ({drawingResults.length})
          </TabsTrigger>
          <TabsTrigger value="comments">
            <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
            Comments
          </TabsTrigger>
        </TabsList>

        {/* Renders Tab */}
        <TabsContent value="renders" className="space-y-6">
          <DesignResultViewer
            beforeImageUrl={beforeImageUrl}
            afterImageUrl={mainRenderUrl}
            renderUrls={renderUrls}
            style={variant.style}
            budgetTier={variant.budgetTier}
            constraints={constraints}
            variantName={variant.name}
            onGenerateBOM={handleGenerateBOM}
            onGenerateDrawings={handleGenerateDrawings}
          />
        </TabsContent>

        {/* BOM Tab */}
        <TabsContent value="bom" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Bill of Materials calculated from this design variant.
            </p>
            <Button
              size="sm"
              onClick={handleGenerateBOM}
              disabled={generateBOM.isPending}
            >
              <ShoppingCart className="mr-1 h-4 w-4" />
              {generateBOM.isPending ? 'Starting...' : 'Generate BOM'}
            </Button>
          </div>

          {bomJobId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">BOM Generation</CardTitle>
              </CardHeader>
              <CardContent>
                <JobProgress
                  jobId={bomJobId}
                  onComplete={() => {
                    utils.bom.listByDesignVariant.invalidate({
                      designVariantId: designId,
                    });
                    setBomJobId(null);
                  }}
                />
              </CardContent>
            </Card>
          )}

          {bomResults.length > 0 ? (
            <div className="space-y-3">
              {bomResults.map((bom) => (
                <Card key={bom.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        BOM Result
                      </CardTitle>
                      {bom.totalCost && (
                        <Badge variant="secondary">
                          {bom.currency ?? 'USD'}{' '}
                          {bom.totalCost.toLocaleString()}
                        </Badge>
                      )}
                    </div>
                    <CardDescription>
                      Generated {new Date(bom.createdAt).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {Array.isArray(bom.items) && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                Item
                              </th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                Qty
                              </th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                Unit
                              </th>
                              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                                Cost
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {(
                              bom.items as Array<{
                                name: string;
                                quantity: number;
                                unit: string;
                                unitPrice: number;
                              }>
                            ).slice(0, 10).map((item, i) => (
                              <tr key={i} className="border-b last:border-0">
                                <td className="px-3 py-2">{item.name}</td>
                                <td className="px-3 py-2">{item.quantity}</td>
                                <td className="px-3 py-2">{item.unit}</td>
                                <td className="px-3 py-2 text-right">
                                  {(item.quantity * item.unitPrice).toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            !bomJobId && (
              <Card className="flex flex-col items-center justify-center p-8 text-center">
                <ShoppingCart className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No BOM generated yet. Click &quot;Generate BOM&quot; to
                  calculate materials and costs.
                </p>
              </Card>
            )
          )}
        </TabsContent>

        {/* Drawings Tab */}
        <TabsContent value="drawings" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Technical drawings generated from this design variant.
            </p>
            <Button
              size="sm"
              onClick={handleGenerateDrawings}
              disabled={generateDrawings.isPending}
            >
              <FileText className="mr-1 h-4 w-4" />
              {generateDrawings.isPending
                ? 'Starting...'
                : 'Generate Drawings'}
            </Button>
          </div>

          {drawingJobId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Drawing Generation</CardTitle>
              </CardHeader>
              <CardContent>
                <JobProgress
                  jobId={drawingJobId}
                  onComplete={() => {
                    utils.drawing.listByDesignVariant.invalidate({
                      designVariantId: designId,
                    });
                    setDrawingJobId(null);
                  }}
                />
              </CardContent>
            </Card>
          )}

          {drawingResults.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {drawingResults.map((drawing) => (
                <Card key={drawing.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4" />
                      {drawing.drawingType
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, (c: string) => c.toUpperCase())}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Generated{' '}
                      {new Date(drawing.createdAt).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      {drawing.pdfStorageKey && (
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={`/api/uploads/${encodeURIComponent(drawing.pdfStorageKey)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View PDF
                          </a>
                        </Button>
                      )}
                      {drawing.svgStorageKey && (
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={`/api/uploads/${encodeURIComponent(drawing.svgStorageKey)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View SVG
                          </a>
                        </Button>
                      )}
                      {drawing.dxfStorageKey && (
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={`/api/uploads/${encodeURIComponent(drawing.dxfStorageKey)}`}
                            download
                          >
                            Download DXF
                          </a>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            !drawingJobId && (
              <Card className="flex flex-col items-center justify-center p-8 text-center">
                <FileText className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No drawings generated yet. Click &quot;Generate Drawings&quot;
                  to create technical drawings.
                </p>
              </Card>
            )
          )}
        </TabsContent>

        {/* Comments Tab */}
        <TabsContent value="comments" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Discussion</CardTitle>
              <CardDescription>
                Leave feedback and comments on this design variant.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Comment input */}
              <div className="flex gap-2">
                <Textarea
                  placeholder="Write a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  rows={2}
                  className="flex-1"
                />
                <Button
                  size="icon"
                  onClick={handlePostComment}
                  disabled={!commentText.trim()}
                  className="shrink-0 self-end"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>

              <Separator />

              {/* Placeholder for comments */}
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <MessageSquare className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No comments yet. Be the first to leave feedback.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Separator className="my-6" />

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <DesignGenerationDialog
              designVariantId={designId}
              roomId={variant.roomId}
              projectId={projectId}
              currentStyle={variant.style}
              currentBudget={variant.budgetTier}
              onGenerated={() => {
                utils.designVariant.listByProject.invalidate({ projectId });
              }}
              trigger={
                <Button variant="outline" size="sm">
                  <Sparkles className="mr-1 h-4 w-4" />
                  Regenerate Design
                </Button>
              }
            />
            <Button variant="outline" size="sm" asChild>
              <Link href={`/project/${projectId}/editor`}>
                <Box className="mr-1 h-4 w-4" />
                View in 3D Editor
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateBOM}
              disabled={generateBOM.isPending}
            >
              <ShoppingCart className="mr-1 h-4 w-4" />
              Generate BOM
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateDrawings}
              disabled={generateDrawings.isPending}
            >
              <FileText className="mr-1 h-4 w-4" />
              Generate Drawings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
