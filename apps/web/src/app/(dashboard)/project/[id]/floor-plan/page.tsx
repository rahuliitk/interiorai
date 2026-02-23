'use client';

import { use, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { FloorPlanUpload } from '@/components/floor-plan-upload';
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
  toast,
} from '@openlintel/ui';
import {
  Map,
  Upload,
  Layers,
  Plus,
  CheckCircle2,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Home,
} from 'lucide-react';

interface DetectedRoom {
  id: string;
  name: string;
  type: string;
  polygon: Array<{ x: number; y: number }>;
  lengthMm?: number;
  widthMm?: number;
  areaSqMm?: number;
}

interface FloorPlanData {
  svgUrl?: string;
  rooms: DetectedRoom[];
  width: number;
  height: number;
  scale: number; // pixels per mm
}

const ROOM_TYPE_COLORS: Record<string, string> = {
  living_room: '#3b82f6',
  bedroom: '#8b5cf6',
  kitchen: '#f97316',
  bathroom: '#06b6d4',
  dining: '#22c55e',
  study: '#eab308',
  balcony: '#84cc16',
  utility: '#6b7280',
  foyer: '#ec4899',
  corridor: '#a3a3a3',
  other: '#9ca3af',
};

function FloorPlanViewer({
  floorPlan,
  onRoomClick,
}: {
  floorPlan: FloorPlanData;
  onRoomClick?: (room: DetectedRoom) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.25));
  const handleReset = () => setZoom(1);

  return (
    <div className="space-y-3">
      {/* Zoom controls */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={handleZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button variant="outline" size="icon" onClick={handleZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={handleReset}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      {/* Floor plan canvas */}
      <div className="overflow-auto rounded-lg border bg-white">
        <div
          className="relative inline-block min-w-full"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
          }}
        >
          {floorPlan.svgUrl ? (
            <img
              src={floorPlan.svgUrl}
              alt="Digitized floor plan"
              className="w-full"
            />
          ) : (
            <svg
              viewBox={`0 0 ${floorPlan.width} ${floorPlan.height}`}
              className="w-full"
              style={{ maxHeight: '600px' }}
            >
              {/* Grid background */}
              <defs>
                <pattern
                  id="grid"
                  width="50"
                  height="50"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 50 0 L 0 0 0 50"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="0.5"
                  />
                </pattern>
              </defs>
              <rect
                width={floorPlan.width}
                height={floorPlan.height}
                fill="url(#grid)"
              />

              {/* Room polygons */}
              {floorPlan.rooms.map((room) => {
                const color =
                  ROOM_TYPE_COLORS[room.type] ?? ROOM_TYPE_COLORS.other;
                const isHovered = hoveredRoom === room.id;
                const points = room.polygon
                  .map((p) => `${p.x},${p.y}`)
                  .join(' ');

                // Calculate centroid for label
                const cx =
                  room.polygon.reduce((s, p) => s + p.x, 0) /
                  room.polygon.length;
                const cy =
                  room.polygon.reduce((s, p) => s + p.y, 0) /
                  room.polygon.length;

                return (
                  <g
                    key={room.id}
                    onMouseEnter={() => setHoveredRoom(room.id)}
                    onMouseLeave={() => setHoveredRoom(null)}
                    onClick={() => onRoomClick?.(room)}
                    className="cursor-pointer"
                  >
                    <polygon
                      points={points}
                      fill={isHovered ? color + '40' : color + '20'}
                      stroke={color}
                      strokeWidth={isHovered ? 3 : 2}
                    />
                    <text
                      x={cx}
                      y={cy - 8}
                      fill={color}
                      fontSize="14"
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {room.name}
                    </text>
                    <text
                      x={cx}
                      y={cy + 8}
                      fill="#6b7280"
                      fontSize="11"
                      textAnchor="middle"
                    >
                      {room.type
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, (c: string) => c.toUpperCase())}
                    </text>
                    {room.areaSqMm && (
                      <text
                        x={cx}
                        y={cy + 22}
                        fill="#9ca3af"
                        fontSize="10"
                        textAnchor="middle"
                      >
                        {(room.areaSqMm / 1_000_000).toFixed(1)} m²
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FloorPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const utils = trpc.useUtils();

  const [creatingRooms, setCreatingRooms] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const { data: project, isLoading: loadingProject } =
    trpc.project.byId.useQuery({ id: projectId });

  // Fetch floor plan uploads
  const { data: uploads = [], isLoading: loadingUploads } =
    trpc.upload.listByProject.useQuery({ projectId });

  const floorPlanUploads = uploads.filter(
    (u) => u.category === 'floor_plan',
  );

  // Create room mutation
  const createRoom = trpc.room.create.useMutation({
    onSuccess: () => {
      utils.project.byId.invalidate({ id: projectId });
    },
  });

  // Floor plan state from digitization results
  const [floorPlanData, setFloorPlanData] = useState<FloorPlanData | null>(null);
  const [detectedRooms, setDetectedRooms] = useState<DetectedRoom[]>([]);

  // Digitize mutation
  const digitize = trpc.floorPlan.digitize.useMutation({
    onSuccess: (job) => {
      if (!job) return;
      setActiveJobId(job.id);
      toast({ title: 'Digitization started', description: 'Analyzing floor plan...' });
    },
    onError: (err) => {
      toast({ title: 'Digitization failed', description: err.message });
    },
  });

  // Job polling
  const { data: jobStatus } = trpc.floorPlan.jobStatus.useQuery(
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

  // When job completes, parse the output into floor plan data
  useEffect(() => {
    if (jobStatus?.status === 'completed' && jobStatus.outputJson) {
      const output = jobStatus.outputJson as {
        rooms: DetectedRoom[];
        width: number;
        height: number;
        scale: number;
      };
      setDetectedRooms(output.rooms || []);
      setFloorPlanData({
        rooms: output.rooms || [],
        width: output.width || 800,
        height: output.height || 600,
        scale: output.scale || 1,
      });
      setActiveJobId(null);
      toast({ title: 'Floor plan digitized successfully', description: `${output.rooms?.length || 0} rooms detected.` });
    } else if (jobStatus?.status === 'failed') {
      setActiveJobId(null);
      toast({ title: 'Digitization failed', description: jobStatus.error || 'Unknown error' });
    }
  }, [jobStatus?.status, jobStatus?.outputJson, jobStatus?.error]);

  const handleDigitize = (uploadId: string) => {
    digitize.mutate({ projectId, uploadId });
  };

  const handleDigitizationComplete = () => {
    utils.upload.listByProject.invalidate({ projectId });
  };

  const handleCreateRoomsFromFloorPlan = async () => {
    if (detectedRooms.length === 0) {
      toast({
        title: 'No rooms detected',
        description: 'Upload and digitize a floor plan first.',
      });
      return;
    }

    setCreatingRooms(true);
    let created = 0;

    for (const room of detectedRooms) {
      try {
        await createRoom.mutateAsync({
          projectId,
          name: room.name,
          type: room.type,
          lengthMm: room.lengthMm,
          widthMm: room.widthMm,
        });
        created++;
      } catch {
        // Skip rooms that fail (e.g., duplicates)
      }
    }

    setCreatingRooms(false);
    toast({
      title: `Created ${created} room${created !== 1 ? 's' : ''}`,
      description: 'Rooms have been added to your project.',
    });
    utils.project.byId.invalidate({ id: projectId });
  };

  if (loadingProject) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!project) {
    return <p className="text-muted-foreground">Project not found.</p>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Floor Plan</h1>
        <p className="text-sm text-muted-foreground">
          Upload and digitize floor plans to auto-detect rooms and dimensions.
        </p>
      </div>

      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload">
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Upload
          </TabsTrigger>
          <TabsTrigger value="viewer">
            <Map className="mr-1.5 h-3.5 w-3.5" />
            Floor Plan Viewer
          </TabsTrigger>
          <TabsTrigger value="rooms">
            <Layers className="mr-1.5 h-3.5 w-3.5" />
            Detected Rooms ({detectedRooms.length})
          </TabsTrigger>
        </TabsList>

        {/* Upload Tab */}
        <TabsContent value="upload" className="space-y-6">
          <FloorPlanUpload
            projectId={projectId}
            onUploadComplete={() => {
              utils.upload.listByProject.invalidate({ projectId });
            }}
            onDigitizationComplete={handleDigitizationComplete}
          />

          {/* Previously uploaded floor plans */}
          {floorPlanUploads.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="mb-3 text-sm font-medium">
                  Uploaded Floor Plans
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {floorPlanUploads.map((upload) => (
                    <Card key={upload.id} className="overflow-hidden">
                      {upload.mimeType.startsWith('image/') ? (
                        <div className="aspect-video bg-muted">
                          <img
                            src={`/api/uploads/${encodeURIComponent(upload.storageKey)}`}
                            alt={upload.filename}
                            className="h-full w-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="flex aspect-video items-center justify-center bg-muted">
                          <Map className="h-10 w-10 text-muted-foreground/50" />
                        </div>
                      )}
                      <CardContent className="p-3">
                        <p className="truncate text-sm font-medium">
                          {upload.filename}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(upload.createdAt).toLocaleDateString()}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* Floor Plan Viewer Tab */}
        <TabsContent value="viewer" className="space-y-4">
          {floorPlanData ? (
            <FloorPlanViewer
              floorPlan={floorPlanData}
              onRoomClick={(room) => {
                toast({
                  title: room.name,
                  description: `${room.type.replace(/_/g, ' ')}${room.areaSqMm ? ` - ${(room.areaSqMm / 1_000_000).toFixed(1)} m\u00B2` : ''}`,
                });
              }}
            />
          ) : floorPlanUploads.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/50">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Ready to Digitize
                  </p>
                  <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                    Click &quot;Digitize&quot; to automatically detect rooms and dimensions from your floor plan using AI vision.
                  </p>
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={digitize.isPending || Boolean(activeJobId)}
                    onClick={() => {
                      const latestUpload = floorPlanUploads[0];
                      if (latestUpload) handleDigitize(latestUpload.id);
                    }}
                  >
                    {activeJobId ? 'Digitizing...' : 'Digitize Floor Plan'}
                  </Button>
                </div>
              </div>

              {/* Show uploaded floor plan as a simple image viewer */}
              {floorPlanUploads
                .filter((u) => u.mimeType.startsWith('image/'))
                .slice(0, 1)
                .map((upload) => (
                  <Card key={upload.id}>
                    <CardContent className="p-4">
                      <div className="overflow-auto rounded-lg border bg-white">
                        <img
                          src={`/api/uploads/${encodeURIComponent(upload.storageKey)}`}
                          alt={upload.filename}
                          className="w-full"
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          ) : (
            <Card className="flex flex-col items-center justify-center p-12 text-center">
              <Map className="mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-lg font-semibold">No Floor Plan</h2>
              <p className="text-sm text-muted-foreground">
                Upload a floor plan in the Upload tab to view it here.
              </p>
            </Card>
          )}
        </TabsContent>

        {/* Detected Rooms Tab */}
        <TabsContent value="rooms" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Rooms detected from the digitized floor plan.
            </p>
            <Button
              size="sm"
              onClick={handleCreateRoomsFromFloorPlan}
              disabled={
                detectedRooms.length === 0 || creatingRooms
              }
            >
              <Home className="mr-1 h-4 w-4" />
              {creatingRooms ? 'Creating...' : 'Use for Project'}
            </Button>
          </div>

          {detectedRooms.length > 0 ? (
            <div className="space-y-3">
              {detectedRooms.map((room) => {
                const color =
                  ROOM_TYPE_COLORS[room.type] ?? ROOM_TYPE_COLORS.other;

                return (
                  <Card key={room.id}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="inline-block h-4 w-4 rounded"
                          style={{ backgroundColor: color }}
                        />
                        <div>
                          <p className="text-sm font-medium">{room.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs">
                              {room.type
                                .replace(/_/g, ' ')
                                .replace(/\b\w/g, (c: string) =>
                                  c.toUpperCase(),
                                )}
                            </Badge>
                            {room.lengthMm && room.widthMm && (
                              <span>
                                {room.lengthMm} x {room.widthMm} mm
                              </span>
                            )}
                            {room.areaSqMm && (
                              <span>
                                {(room.areaSqMm / 1_000_000).toFixed(1)} m²
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="flex flex-col items-center justify-center p-12 text-center">
              <Layers className="mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-lg font-semibold">No Rooms Detected</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Upload and digitize a floor plan to automatically detect rooms.
                Once rooms are detected, you can add them to your project with
                one click.
              </p>
              <div className="flex items-start gap-3 max-w-md rounded-lg border border-amber-200 bg-amber-50 p-3 text-left dark:border-amber-900 dark:bg-amber-950/50">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Room detection requires the vision-engine microservice. This
                  will be available once the service is deployed.
                </p>
              </div>
            </Card>
          )}

          {/* Existing project rooms for reference */}
          {project.rooms.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="mb-3 text-sm font-medium">
                  Existing Project Rooms ({project.rooms.length})
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {project.rooms.map((room) => (
                    <div
                      key={room.id}
                      className="flex items-center gap-2 rounded-lg border p-3"
                    >
                      <Home className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{room.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {room.type
                            .replace(/_/g, ' ')
                            .replace(/\b\w/g, (c: string) => c.toUpperCase())}
                          {room.lengthMm && room.widthMm
                            ? ` - ${room.lengthMm} x ${room.widthMm} mm`
                            : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
