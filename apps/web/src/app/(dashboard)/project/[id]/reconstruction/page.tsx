'use client';

import { use, useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Skeleton,
  Progress,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Label,
  toast,
} from '@openlintel/ui';
import {
  Camera,
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  Box,
  Ruler,
  ImageIcon,
  ArrowRight,
} from 'lucide-react';

/* ─── Constants ─────────────────────────────────────────────── */

const REFERENCE_OBJECTS = [
  { value: 'door', label: 'Standard Door (900 x 2100 mm)' },
  { value: 'a4_paper', label: 'A4 Paper (210 x 297 mm)' },
  { value: 'standard_brick', label: 'Standard Brick (215 x 65 mm)' },
] as const;

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-800',
  running: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ─── Page Component ────────────────────────────────────────── */

export default function ReconstructionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [referenceObject, setReferenceObject] = useState<string>('door');
  const [uploadIds, setUploadIds] = useState<string[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  /* ── Queries ──────────────────────────────────────────────── */
  const { data: project, isLoading: projectLoading } = trpc.project.getById.useQuery({ id: projectId });

  const rooms = (project as any)?.rooms ?? [];

  const { data: jobResult, isLoading: jobLoading } = trpc.reconstruction.getResult.useQuery(
    { jobId: activeJobId! },
    { enabled: !!activeJobId, refetchInterval: activeJobId ? 2000 : false },
  );

  const { data: pastJobs = [] } = trpc.reconstruction.listByRoom.useQuery(
    { roomId: selectedRoom },
    { enabled: !!selectedRoom },
  );

  // Stop polling when job completes
  useEffect(() => {
    if (jobResult?.status === 'completed' || jobResult?.status === 'failed') {
      utils.reconstruction.listByRoom.invalidate();
    }
  }, [jobResult?.status]);

  /* ── Mutations ────────────────────────────────────────────── */
  const startReconstruction = trpc.reconstruction.startReconstruction.useMutation({
    onSuccess: (job) => {
      setActiveJobId(job.id);
      toast({ title: 'Reconstruction started', description: 'Processing your photos...' });
    },
    onError: (err) => {
      toast({ title: 'Failed to start reconstruction', description: err.message, variant: 'destructive' });
    },
  });

  const updateRoom = trpc.room.update.useMutation({
    onSuccess: () => {
      toast({ title: 'Room dimensions updated', description: 'Reconstruction measurements applied.' });
    },
    onError: (err) => {
      toast({ title: 'Failed to update room', description: err.message, variant: 'destructive' });
    },
  });

  /* ── Handlers ─────────────────────────────────────────────── */
  function handleStart() {
    if (!selectedRoom || uploadIds.length === 0) return;
    startReconstruction.mutate({
      projectId,
      roomId: selectedRoom,
      uploadIds,
      referenceObject: referenceObject || undefined,
    });
  }

  function handleApplyDimensions() {
    if (!jobResult?.outputJson || !selectedRoom) return;
    const output = jobResult.outputJson as any;
    updateRoom.mutate({
      id: selectedRoom,
      lengthMm: Math.round(output.length_mm),
      widthMm: Math.round(output.width_mm),
      heightMm: Math.round(output.height_mm),
    });
  }

  /* ── Loading state ────────────────────────────────────────── */
  if (projectLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const output = jobResult?.outputJson as any;
  const isProcessing = jobResult?.status === 'running' || jobResult?.status === 'pending';

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="mb-6 flex items-center gap-3">
        <Camera className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Photo-to-3D Reconstruction</h1>
          <p className="text-sm text-muted-foreground">
            Upload room photos to extract dimensions and generate 3D models.
          </p>
        </div>
      </div>

      {/* ── Configuration ───────────────────────────────────── */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6 space-y-3">
            <Label>Select Room</Label>
            <Select value={selectedRoom} onValueChange={setSelectedRoom}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a room" />
              </SelectTrigger>
              <SelectContent>
                {rooms.map((room: any) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name} ({room.type.replace(/_/g, ' ')})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-3">
            <Label>Calibration Reference</Label>
            <Select value={referenceObject} onValueChange={setReferenceObject}>
              <SelectTrigger>
                <SelectValue placeholder="Choose reference" />
              </SelectTrigger>
              <SelectContent>
                {REFERENCE_OBJECTS.map((ref) => (
                  <SelectItem key={ref.value} value={ref.value}>
                    {ref.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-3">
            <Label>Room Photos</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg border-2 border-dashed border-muted-foreground/25 p-4 text-center">
                <Upload className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  {uploadIds.length > 0 ? `${uploadIds.length} photo(s) selected` : 'Upload photos via Uploads tab'}
                </p>
              </div>
            </div>
            <input
              type="text"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Paste upload IDs (comma-separated)"
              onChange={(e) => {
                const ids = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                setUploadIds(ids);
              }}
            />
          </CardContent>
        </Card>
      </div>

      {/* ── Start Button ────────────────────────────────────── */}
      <div className="mb-6">
        <Button
          onClick={handleStart}
          disabled={!selectedRoom || uploadIds.length === 0 || startReconstruction.isPending || isProcessing}
          className="w-full sm:w-auto"
        >
          {startReconstruction.isPending || isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Camera className="mr-2 h-4 w-4" />
              Start Reconstruction
            </>
          )}
        </Button>
      </div>

      {/* ── Active Job Progress ─────────────────────────────── */}
      {activeJobId && jobResult && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Reconstruction Progress</CardTitle>
              <Badge className={STATUS_COLORS[jobResult.status] || ''}>
                {jobResult.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={jobResult.progress} />
            <p className="text-sm text-muted-foreground">
              {jobResult.status === 'running' && output?.current_step
                ? output.current_step
                : jobResult.status === 'completed'
                  ? 'Reconstruction complete'
                  : jobResult.status === 'failed'
                    ? jobResult.error || 'An error occurred'
                    : 'Starting...'}
            </p>

            {/* ── Results ────────────────────────────────────── */}
            {jobResult.status === 'completed' && output && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Extracted Room Dimensions</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(output.dimensions ?? []).map((dim: any) => (
                    <div
                      key={dim.measurement}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <Ruler className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm font-medium capitalize">{dim.measurement}</p>
                        <p className="text-lg font-bold">{Math.round(dim.value_mm)} mm</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <div
                            className="h-1.5 rounded-full bg-primary"
                            style={{ width: `${dim.confidence * 60}px` }}
                          />
                          <span className="text-[10px] text-muted-foreground">
                            {Math.round(dim.confidence * 100)}% confidence
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 3D Preview placeholder */}
                <div className="rounded-lg border bg-muted/30 p-8 text-center">
                  <Box className="mx-auto mb-2 h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    3D Room Preview: {Math.round(output.length_mm / 10)} x{' '}
                    {Math.round(output.width_mm / 10)} x {Math.round(output.height_mm / 10)} cm
                  </p>
                  {output.mesh_storage_key && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      asChild
                    >
                      <a href={`/api/uploads/${encodeURIComponent(output.mesh_storage_key)}`} download>
                        Download 3D Model (.glb)
                      </a>
                    </Button>
                  )}
                </div>

                {/* Apply to room button */}
                <Button
                  onClick={handleApplyDimensions}
                  disabled={updateRoom.isPending}
                  className="w-full"
                >
                  {updateRoom.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <ArrowRight className="mr-2 h-4 w-4" />
                      Apply Dimensions to Room
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Past Reconstructions ────────────────────────────── */}
      {selectedRoom && pastJobs.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Past Reconstructions</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pastJobs.map((job: any) => {
              const jobOutput = job.outputJson as any;
              return (
                <Card
                  key={job.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => setActiveJobId(job.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardDescription>{formatDate(job.createdAt)}</CardDescription>
                      <Badge className={`text-[10px] ${STATUS_COLORS[job.status] || ''}`}>
                        {job.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {job.status === 'completed' && jobOutput ? (
                      <div className="space-y-1 text-sm">
                        <p>
                          <span className="text-muted-foreground">Length:</span>{' '}
                          <span className="font-medium">{Math.round(jobOutput.length_mm)} mm</span>
                        </p>
                        <p>
                          <span className="text-muted-foreground">Width:</span>{' '}
                          <span className="font-medium">{Math.round(jobOutput.width_mm)} mm</span>
                        </p>
                        <p>
                          <span className="text-muted-foreground">Height:</span>{' '}
                          <span className="font-medium">{Math.round(jobOutput.height_mm)} mm</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {jobOutput.images_processed} photos processed
                        </p>
                      </div>
                    ) : job.status === 'failed' ? (
                      <div className="flex items-center gap-2 text-sm text-red-600">
                        <XCircle className="h-4 w-4" />
                        {(job as any).error || 'Failed'}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Processing...
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────── */}
      {!selectedRoom && (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Camera className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">Get Started</h2>
          <p className="text-sm text-muted-foreground">
            Select a room, upload photos, and start a reconstruction to extract room dimensions.
          </p>
        </Card>
      )}
    </div>
  );
}
