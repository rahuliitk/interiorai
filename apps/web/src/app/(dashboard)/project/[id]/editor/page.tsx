'use client';

import { use, useState, useCallback, useRef, useEffect, Suspense, lazy } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Skeleton,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@openlintel/ui';
import {
  ArrowLeft,
  Box,
  ChevronRight,
  GripVertical,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@openlintel/ui';

import { Scene } from '@/components/editor-3d/scene';
import { RoomGeometry } from '@/components/editor-3d/room-geometry';
import { FurnitureObject } from '@/components/editor-3d/furniture-object';
import { CameraControls } from '@/components/editor-3d/camera-controls';
import { Toolbar, type EditorTool, type ViewPreset } from '@/components/editor-3d/toolbar';
import { MaterialPanel, type MaterialPreset } from '@/components/editor-3d/material-panel';
import { LightingPanel, getDefaultLightingConfig, type LightingConfig } from '@/components/editor-3d/lighting-panel';
import { SnapGrid, SnapGridControls } from '@/components/editor-3d/snap-grid';
import { CollabPresence } from '@/components/editor-3d/collab-presence';
import { createCollabSession, type CollabSession } from '@/lib/collaboration';
import {
  FURNITURE_CATALOGUE,
  getCatalogueByCategory,
  createPlacedFurniture,
  type PlacedFurniture,
  type FurniturePrimitive,
} from '@/lib/gltf-loader';
import { type GridSizeValue } from '@/lib/snap-engine';
import { DEFAULT_ROOM } from '@/lib/room-builder';

interface HistoryEntry {
  furniture: PlacedFurniture[];
}

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: project, isLoading } = trpc.project.byId.useQuery({ id });

  // Room selection
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');

  // Editor state
  const [activeTool, setActiveTool] = useState<EditorTool>('select');
  const [viewPreset, setViewPreset] = useState<ViewPreset>('perspective');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);

  // Grid / snap
  const [gridSize, setGridSize] = useState<GridSizeValue>(0.1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  // Lighting
  const [lightingConfig, setLightingConfig] = useState<LightingConfig>(getDefaultLightingConfig());

  // Furniture in scene
  const [furniture, setFurniture] = useState<PlacedFurniture[]>([]);

  // Undo/Redo
  const [history, setHistory] = useState<HistoryEntry[]>([{ furniture: [] }]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Ceiling toggle
  const [showCeiling, setShowCeiling] = useState(false);

  // Collaboration session
  const [collab, setCollab] = useState<CollabSession | null>(null);

  useEffect(() => {
    if (!project) return;
    const userId = 'user'; // In production, this comes from the auth session
    const session = createCollabSession(id, userId);
    setCollab(session);

    // Observe remote furniture changes from Y.js
    const observer = () => {
      const remoteFurniture: PlacedFurniture[] = [];
      session.furnitureMap.forEach((value, key) => {
        if (value && typeof value === 'object') {
          remoteFurniture.push(value as PlacedFurniture);
        }
      });
      if (remoteFurniture.length > 0) {
        setFurniture(remoteFurniture);
      }
    };
    session.furnitureMap.observe(observer);

    return () => {
      session.furnitureMap.unobserve(observer);
      session.destroy();
    };
  }, [project, id]);

  // Sync local furniture changes to Y.js
  const syncToCollab = useCallback(
    (items: PlacedFurniture[]) => {
      if (!collab) return;
      collab.doc.transact(() => {
        // Remove items no longer present
        const currentKeys = new Set(items.map((f) => f.id));
        collab.furnitureMap.forEach((_value, key) => {
          if (!currentKeys.has(key)) {
            collab.furnitureMap.delete(key);
          }
        });
        // Update/add items
        items.forEach((item) => {
          collab.furnitureMap.set(item.id, { ...item });
        });
      });
    },
    [collab],
  );

  // Catalogue grouped by category
  const catalogue = getCatalogueByCategory();
  const [expandedCategory, setExpandedCategory] = useState<string>(Object.keys(catalogue)[0] || '');

  // Set first room when project loads
  useEffect(() => {
    if (project?.rooms?.length && !selectedRoomId) {
      setSelectedRoomId(project.rooms[0].id);
    }
  }, [project, selectedRoomId]);

  // Get selected room
  const selectedRoom = project?.rooms?.find((r) => r.id === selectedRoomId);
  const roomDimensions = selectedRoom
    ? {
        lengthMm: selectedRoom.lengthMm ?? DEFAULT_ROOM.lengthMm,
        widthMm: selectedRoom.widthMm ?? DEFAULT_ROOM.widthMm,
        heightMm: DEFAULT_ROOM.heightMm,
      }
    : DEFAULT_ROOM;
  const roomLengthM = roomDimensions.lengthMm / 1000;
  const roomWidthM = roomDimensions.widthMm / 1000;
  const roomHeightM = roomDimensions.heightMm / 1000;

  // Record history and sync to collaboration
  const pushHistory = useCallback(
    (newFurniture: PlacedFurniture[]) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push({ furniture: JSON.parse(JSON.stringify(newFurniture)) });
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      syncToCollab(newFurniture);
    },
    [history, historyIndex, syncToCollab],
  );

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setFurniture(JSON.parse(JSON.stringify(history[newIndex].furniture)));
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setFurniture(JSON.parse(JSON.stringify(history[newIndex].furniture)));
    }
  }, [history, historyIndex]);

  // Add furniture to scene
  const handleAddFurniture = useCallback(
    (primitive: FurniturePrimitive) => {
      const placed = createPlacedFurniture(primitive, [0, primitive.size[1] / 2, 0]);
      const newFurniture = [...furniture, placed];
      setFurniture(newFurniture);
      pushHistory(newFurniture);
      setSelectedObjectId(placed.id);
      setActiveTool('move');
    },
    [furniture, pushHistory],
  );

  // Move furniture
  const handleMoveFurniture = useCallback(
    (objectId: string, position: [number, number, number]) => {
      setFurniture((prev) =>
        prev.map((f) => (f.id === objectId ? { ...f, position } : f)),
      );
    },
    [],
  );

  // On drop (end of transform) record history
  const handleMoveEnd = useCallback(
    (objectId: string, position: [number, number, number]) => {
      const updated = furniture.map((f) => (f.id === objectId ? { ...f, position } : f));
      pushHistory(updated);
    },
    [furniture, pushHistory],
  );

  // Rotate furniture
  const handleRotateFurniture = useCallback(
    (objectId: string, rotation: [number, number, number]) => {
      setFurniture((prev) =>
        prev.map((f) => (f.id === objectId ? { ...f, rotation } : f)),
      );
    },
    [],
  );

  // Scale furniture
  const handleScaleFurniture = useCallback(
    (objectId: string, scale: [number, number, number]) => {
      setFurniture((prev) =>
        prev.map((f) => (f.id === objectId ? { ...f, scale } : f)),
      );
    },
    [],
  );

  // Delete selected
  const handleDeleteSelected = useCallback(() => {
    if (!selectedObjectId) return;
    const newFurniture = furniture.filter((f) => f.id !== selectedObjectId);
    setFurniture(newFurniture);
    pushHistory(newFurniture);
    setSelectedObjectId(null);
  }, [selectedObjectId, furniture, pushHistory]);

  // Duplicate selected
  const handleDuplicateSelected = useCallback(() => {
    if (!selectedObjectId) return;
    const original = furniture.find((f) => f.id === selectedObjectId);
    if (!original) return;
    const duplicate = createPlacedFurniture(
      {
        name: original.name,
        category: original.category,
        size: [...original.size],
        color: original.color,
        modelUrl: original.modelUrl,
      },
      [original.position[0] + 0.5, original.position[1], original.position[2] + 0.5],
    );
    duplicate.rotation = [...original.rotation];
    duplicate.scale = [...original.scale];
    const newFurniture = [...furniture, duplicate];
    setFurniture(newFurniture);
    pushHistory(newFurniture);
    setSelectedObjectId(duplicate.id);
  }, [selectedObjectId, furniture, pushHistory]);

  // Apply material to selected
  const handleApplyMaterial = useCallback(
    (material: MaterialPreset) => {
      if (!selectedObjectId) return;
      const newFurniture = furniture.map((f) =>
        f.id === selectedObjectId ? { ...f, color: material.color } : f,
      );
      setFurniture(newFurniture);
      pushHistory(newFurniture);
    },
    [selectedObjectId, furniture, pushHistory],
  );

  // Apply colour to selected
  const handleApplyColor = useCallback(
    (color: string) => {
      if (!selectedObjectId) return;
      const newFurniture = furniture.map((f) =>
        f.id === selectedObjectId ? { ...f, color } : f,
      );
      setFurniture(newFurniture);
      pushHistory(newFurniture);
    },
    [selectedObjectId, furniture, pushHistory],
  );

  // Fullscreen toggle
  const handleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
      } else if (e.key === 'v' || e.key === 'V') {
        setActiveTool('select');
      } else if (e.key === 'g' || e.key === 'G') {
        setActiveTool('move');
      } else if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
        setActiveTool('rotate');
      } else if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
        setActiveTool('scale');
      } else if (e.key === 'm' || e.key === 'M') {
        setActiveTool('measure');
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        handleDuplicateSelected();
      } else if (e.key === 'Escape') {
        setSelectedObjectId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleDeleteSelected, handleUndo, handleRedo, handleDuplicateSelected]);

  // Get selected furniture object
  const selectedFurniture = furniture.find((f) => f.id === selectedObjectId) ?? null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  if (!project) {
    return <p className="text-muted-foreground">Project not found.</p>;
  }

  return (
    <div ref={containerRef} className="flex h-[calc(100vh-7rem)] flex-col">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            href={`/project/${id}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-bold tracking-tight">3D Editor</h1>
          {selectedRoom && (
            <>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{selectedRoom.name}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Room selector */}
          {project.rooms.length > 0 && (
            <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Select room" />
              </SelectTrigger>
              <SelectContent>
                {project.rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <CollabPresence
            socket={collab?.socket ?? null}
            currentUserId="user"
          />
          <SnapGridControls
            gridSize={gridSize}
            onGridSizeChange={setGridSize}
            snapEnabled={snapEnabled}
            onSnapToggle={() => setSnapEnabled(!snapEnabled)}
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-2 flex items-center justify-between">
        <Toolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          onViewChange={setViewPreset}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          onFullscreen={handleFullscreen}
          isFullscreen={isFullscreen}
        />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowGrid(!showGrid)}
          >
            {showGrid ? <Eye className="mr-1 h-3 w-3" /> : <EyeOff className="mr-1 h-3 w-3" />}
            Grid
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowCeiling(!showCeiling)}
          >
            {showCeiling ? <Eye className="mr-1 h-3 w-3" /> : <EyeOff className="mr-1 h-3 w-3" />}
            Ceiling
          </Button>
        </div>
      </div>

      {/* Main layout: Left panel | 3D viewport | Right panel */}
      <div className="flex flex-1 gap-2 overflow-hidden">
        {/* Left panel: Furniture catalogue */}
        <div className="w-56 shrink-0 overflow-y-auto rounded-lg border bg-background p-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Furniture
          </p>
          {Object.entries(catalogue).map(([category, items]) => (
            <div key={category} className="mb-1">
              <button
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium hover:bg-muted"
                onClick={() =>
                  setExpandedCategory(expandedCategory === category ? '' : category)
                }
              >
                {category}
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {items.length}
                </Badge>
              </button>
              {expandedCategory === category && (
                <div className="ml-1 space-y-0.5 py-1">
                  {items.map((item, idx) => (
                    <button
                      key={idx}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                      onClick={() => handleAddFurniture(item)}
                      title={`Add ${item.name}`}
                    >
                      <div
                        className="h-4 w-4 rounded border shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="truncate text-left">{item.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 3D Viewport */}
        <div className="flex-1 overflow-hidden rounded-lg border">
          {project.rooms.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Box className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-sm font-medium">No rooms in this project</p>
                <p className="text-xs text-muted-foreground">
                  Add rooms to your project to start the 3D editor.
                </p>
                <Link href={`/project/${id}`}>
                  <Button size="sm" className="mt-4">
                    Go to Project
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <Scene showStats={false} environmentPreset="apartment">
              <CameraControls
                viewPreset={viewPreset}
                roomLengthM={roomLengthM}
                roomWidthM={roomWidthM}
                roomHeightM={roomHeightM}
              />
              <RoomGeometry
                dimensions={roomDimensions}
                showCeiling={showCeiling}
                showGrid={showGrid}
              />
              <SnapGrid
                roomLengthM={roomLengthM}
                roomWidthM={roomWidthM}
                gridSize={gridSize}
                visible={showGrid && snapEnabled}
              />

              {/* Dynamic lighting from config */}
              <ambientLight
                color={lightingConfig.ambientColor}
                intensity={lightingConfig.ambientIntensity}
              />
              <directionalLight
                color={lightingConfig.directionalColor}
                intensity={lightingConfig.directionalIntensity}
                position={lightingConfig.directionalPosition}
                castShadow
              />

              {/* Furniture objects */}
              {furniture.map((item) => (
                <FurnitureObject
                  key={item.id}
                  item={item}
                  isSelected={selectedObjectId === item.id}
                  activeTool={activeTool === 'measure' ? 'select' : activeTool}
                  gridSize={gridSize}
                  snapEnabled={snapEnabled}
                  roomLengthM={roomLengthM}
                  roomWidthM={roomWidthM}
                  onSelect={setSelectedObjectId}
                  onMove={handleMoveFurniture}
                  onRotate={handleRotateFurniture}
                  onScale={handleScaleFurniture}
                />
              ))}

              {/* Deselect when clicking on empty space */}
              <mesh
                position={[0, -0.01, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                onClick={() => setSelectedObjectId(null)}
                visible={false}
              >
                <planeGeometry args={[100, 100]} />
                <meshBasicMaterial transparent opacity={0} />
              </mesh>
            </Scene>
          )}
        </div>

        {/* Right panel: Properties / Materials / Lighting */}
        <div className="w-60 shrink-0 space-y-2 overflow-y-auto">
          {/* Selected object properties */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Properties</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedFurniture ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium">{selectedFurniture.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedFurniture.category}</p>
                  </div>

                  <Separator />

                  {/* Position */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Position (m)</p>
                    <div className="grid grid-cols-3 gap-1">
                      {['X', 'Y', 'Z'].map((axis, i) => (
                        <div key={axis} className="text-center">
                          <p className="text-[10px] text-muted-foreground">{axis}</p>
                          <p className="text-xs font-mono">
                            {selectedFurniture.position[i].toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Size */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Size (m)</p>
                    <div className="grid grid-cols-3 gap-1">
                      {['W', 'H', 'D'].map((axis, i) => (
                        <div key={axis} className="text-center">
                          <p className="text-[10px] text-muted-foreground">{axis}</p>
                          <p className="text-xs font-mono">
                            {(selectedFurniture.size[i] * selectedFurniture.scale[i]).toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Rotation */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Rotation (deg)</p>
                    <div className="grid grid-cols-3 gap-1">
                      {['X', 'Y', 'Z'].map((axis, i) => (
                        <div key={axis} className="text-center">
                          <p className="text-[10px] text-muted-foreground">{axis}</p>
                          <p className="text-xs font-mono">
                            {((selectedFurniture.rotation[i] * 180) / Math.PI).toFixed(0)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 flex-1 text-xs"
                      onClick={handleDuplicateSelected}
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      Duplicate
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 flex-1 text-xs"
                      onClick={handleDeleteSelected}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Delete
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Select an object to see its properties.
                </p>
              )}
            </CardContent>
          </Card>

          <Tabs defaultValue="materials">
            <TabsList className="w-full">
              <TabsTrigger value="materials" className="flex-1 text-xs">
                Materials
              </TabsTrigger>
              <TabsTrigger value="lighting" className="flex-1 text-xs">
                Lighting
              </TabsTrigger>
            </TabsList>
            <TabsContent value="materials">
              <MaterialPanel
                selectedObjectId={selectedObjectId}
                onApplyMaterial={handleApplyMaterial}
                onApplyColor={handleApplyColor}
              />
            </TabsContent>
            <TabsContent value="lighting">
              <LightingPanel
                config={lightingConfig}
                onChange={setLightingConfig}
              />
            </TabsContent>
          </Tabs>

          {/* Scene info */}
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Objects</span>
                  <span className="font-medium">{furniture.length}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Room</span>
                  <span className="font-medium">
                    {roomDimensions.lengthMm} x {roomDimensions.widthMm} mm
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Grid</span>
                  <span className="font-medium">
                    {snapEnabled ? `${gridSize * 1000} mm` : 'Off'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
