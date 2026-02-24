'use client';

import { use, useState, useCallback, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import QRCode from 'qrcode';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Separator,
} from '@openlintel/ui';
import {
  ArrowLeft,
  Smartphone,
  Glasses,
  QrCode,
  Monitor,
  Info,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { XRViewer, type XRMode } from '@/components/xr/xr-viewer';
import { ARPlacement, type ARPlacedItem } from '@/components/xr/ar-placement';
import { VRWalkthrough, type VRWaypoint } from '@/components/xr/vr-walkthrough';
import { FURNITURE_CATALOGUE } from '@/lib/gltf-loader';

export default function ARPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: project, isLoading } = trpc.project.byId.useQuery({ id });

  const [xrMode, setXRMode] = useState<XRMode>('none');
  const [activeTab, setActiveTab] = useState<string>('ar');
  const [placedItems, setPlacedItems] = useState<ARPlacedItem[]>([]);
  const [activeWaypointId, setActiveWaypointId] = useState<string | null>(null);
  const [currentRoomId, setCurrentRoomId] = useState<string>('');

  // Set initial room
  const rooms = (project as any)?.rooms ?? [];
  if (rooms.length > 0 && !currentRoomId && rooms[0]) {
    setCurrentRoomId(rooms[0].id);
  }

  // Generate waypoints from rooms
  const waypoints: VRWaypoint[] = useMemo(() => {
    return rooms.flatMap((room: any) => [
      {
        id: `wp_${room.id}_center`,
        name: `${room.name} - Center`,
        roomId: room.id,
        roomName: room.name,
        position: [0, 1.6, 0] as [number, number, number],
        lookAt: [0, 1.6, -1] as [number, number, number],
      },
      {
        id: `wp_${room.id}_entrance`,
        name: `${room.name} - Entrance`,
        roomId: room.id,
        roomName: room.name,
        position: [0, 1.6, 2] as [number, number, number],
        lookAt: [0, 1.6, 0] as [number, number, number],
      },
      {
        id: `wp_${room.id}_corner`,
        name: `${room.name} - Corner View`,
        roomId: room.id,
        roomName: room.name,
        position: [2, 1.6, 2] as [number, number, number],
        lookAt: [0, 1.0, 0] as [number, number, number],
      },
    ]);
  }, [rooms]);

  // Available furniture for AR placement (subset)
  const arFurnitureItems = useMemo(
    () =>
      FURNITURE_CATALOGUE.slice(0, 12).map((f) => ({
        name: f.name,
        category: f.category,
        color: f.color,
      })),
    [],
  );

  // AR callbacks
  const handlePlaceItem = useCallback((item: ARPlacedItem) => {
    setPlacedItems((prev) => [...prev, item]);
  }, []);

  const handleConfirmItem = useCallback((itemId: string) => {
    setPlacedItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, confirmed: true } : item)),
    );
  }, []);

  const handleRemoveItem = useCallback((itemId: string) => {
    setPlacedItems((prev) => prev.filter((item) => item.id !== itemId));
  }, []);

  const handleScaleChange = useCallback((itemId: string, scale: number) => {
    setPlacedItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, scale } : item)),
    );
  }, []);

  // QR code URL (for sharing with mobile)
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = typeof window !== 'undefined'
      ? window.location.href
      : `https://app.openlintel.com/project/${id}/ar`;
    QRCode.toDataURL(url, {
      width: 384,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [id]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!project) {
    return <p className="text-muted-foreground">Project not found.</p>;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/project/${id}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to project
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">AR / VR Viewer</h1>
        <p className="text-sm text-muted-foreground">
          View your designs in augmented or virtual reality.
        </p>
      </div>

      {/* Device capability info */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Monitor className="h-5 w-5" />
            Device Capabilities
          </CardTitle>
          <CardDescription>WebXR feature detection for your current device.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Smartphone className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">AR Mode</p>
                <p className="text-xs text-muted-foreground">
                  Requires WebXR-capable mobile browser
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Glasses className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">VR Mode</p>
                <p className="text-xs text-muted-foreground">
                  Requires VR headset (Quest, Vive, etc.)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Monitor className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">3D Preview</p>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  <p className="text-xs text-green-600">Always available</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mode selection tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="ar" className="gap-1">
            <Smartphone className="h-4 w-4" />
            AR Placement
          </TabsTrigger>
          <TabsTrigger value="vr" className="gap-1">
            <Glasses className="h-4 w-4" />
            VR Walkthrough
          </TabsTrigger>
          <TabsTrigger value="share" className="gap-1">
            <QrCode className="h-4 w-4" />
            Share / QR
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ar">
          <div className="grid gap-4 lg:grid-cols-3">
            {/* 3D Preview area */}
            <div className="lg:col-span-2">
              <Card className="overflow-hidden">
                <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900">
                  <XRViewer
                    mode={xrMode}
                    onModeChange={setXRMode}
                  >
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center">
                        <Smartphone className="mx-auto mb-3 h-16 w-16 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">
                          3D preview area
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Use AR mode on a compatible mobile device
                        </p>
                      </div>
                    </div>
                  </XRViewer>
                </div>
              </Card>
            </div>

            {/* AR controls panel */}
            <div>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">AR Placement</CardTitle>
                  <CardDescription className="text-xs">
                    Place furniture from your project into your real space.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ARPlacement
                    items={arFurnitureItems}
                    placedItems={placedItems}
                    onPlace={handlePlaceItem}
                    onConfirm={handleConfirmItem}
                    onRemove={handleRemoveItem}
                    onScaleChange={handleScaleChange}
                    sessionActive={xrMode === 'ar'}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="vr">
          <div className="grid gap-4 lg:grid-cols-3">
            {/* VR viewport */}
            <div className="lg:col-span-2">
              <Card className="overflow-hidden">
                <div className="aspect-video bg-gradient-to-br from-indigo-50 to-purple-100 dark:from-indigo-950 dark:to-purple-950">
                  <XRViewer
                    mode={xrMode}
                    onModeChange={setXRMode}
                  >
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center">
                        <Glasses className="mx-auto mb-3 h-16 w-16 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">
                          VR preview area
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Connect a VR headset to start walkthrough
                        </p>
                      </div>
                    </div>
                  </XRViewer>
                </div>
              </Card>
            </div>

            {/* VR controls panel */}
            <div>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">VR Walkthrough</CardTitle>
                  <CardDescription className="text-xs">
                    Walk through your designed rooms in virtual reality.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <VRWalkthrough
                    rooms={rooms.map((r: any) => ({
                      id: r.id,
                      name: r.name,
                      type: r.type,
                    }))}
                    waypoints={waypoints}
                    activeWaypointId={activeWaypointId}
                    onTeleport={setActiveWaypointId}
                    onRoomChange={setCurrentRoomId}
                    currentRoomId={currentRoomId}
                    sessionActive={xrMode === 'vr'}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="share">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* QR Code section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <QrCode className="h-5 w-5" />
                  Mobile AR QR Code
                </CardTitle>
                <CardDescription>
                  Scan this QR code with your phone to open the AR viewer directly on your
                  mobile device.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center gap-4">
                  {/* QR code */}
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="QR Code for AR viewer"
                      className="h-48 w-48 rounded-lg"
                    />
                  ) : (
                    <div className="flex h-48 w-48 items-center justify-center rounded-lg border-2 border-dashed bg-muted">
                      <div className="text-center">
                        <QrCode className="mx-auto mb-2 h-12 w-12 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Generating...</p>
                      </div>
                    </div>
                  )}

                  <div className="w-full rounded-lg bg-muted p-3">
                    <p className="break-all text-xs font-mono text-muted-foreground">
                      {currentUrl || `https://app.openlintel.com/project/${id}/ar`}
                    </p>
                  </div>

                  <div className="flex w-full gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          currentUrl || `https://app.openlintel.com/project/${id}/ar`,
                        );
                      }}
                    >
                      Copy Link
                    </Button>
                    {qrDataUrl && (
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          const a = document.createElement('a');
                          a.href = qrDataUrl;
                          a.download = `qr-project-${id.slice(0, 8)}.png`;
                          a.click();
                        }}
                      >
                        Download QR
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Instructions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Info className="h-5 w-5" />
                  How to Use
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-medium">
                      <Smartphone className="h-4 w-4" />
                      AR Mode (Mobile)
                    </h3>
                    <ol className="ml-6 mt-2 list-decimal space-y-1 text-xs text-muted-foreground">
                      <li>Open the link on your mobile device (Chrome/Safari)</li>
                      <li>Grant camera permissions when prompted</li>
                      <li>Point your camera at a flat surface (floor, table)</li>
                      <li>Wait for surface detection (you will see a marker)</li>
                      <li>Tap to place furniture items</li>
                      <li>Pinch to resize, drag to reposition</li>
                    </ol>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-medium">
                      <Glasses className="h-4 w-4" />
                      VR Mode (Headset)
                    </h3>
                    <ol className="ml-6 mt-2 list-decimal space-y-1 text-xs text-muted-foreground">
                      <li>Connect your VR headset (Quest, Vive, etc.)</li>
                      <li>Open the link in the headset browser</li>
                      <li>Click &quot;Enter VR&quot; to start the experience</li>
                      <li>Use controllers to teleport between rooms</li>
                      <li>Look around to explore your design</li>
                    </ol>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-sm font-medium">Supported Devices</h3>
                    <div className="mt-2 space-y-1">
                      {[
                        { name: 'Meta Quest 2/3/Pro', supported: true },
                        { name: 'Apple Vision Pro', supported: true },
                        { name: 'HTC Vive', supported: true },
                        { name: 'Android (Chrome)', supported: true },
                        { name: 'iOS Safari (AR Quick Look)', supported: true },
                        { name: 'Desktop browsers', supported: false, note: '3D preview only' },
                      ].map((device) => (
                        <div key={device.name} className="flex items-center gap-2 text-xs">
                          {device.supported ? (
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                          ) : (
                            <XCircle className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className={device.supported ? '' : 'text-muted-foreground'}>
                            {device.name}
                          </span>
                          {device.note && (
                            <span className="text-[10px] text-muted-foreground">
                              ({device.note})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
