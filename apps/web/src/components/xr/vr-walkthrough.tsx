'use client';

import { useState, useCallback } from 'react';
import { Button, Card, CardHeader, CardTitle, CardContent, Badge } from '@openlintel/ui';
import { cn } from '@openlintel/ui';
import {
  Navigation,
  Footprints,
  Eye,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  MapPin,
  Glasses,
} from 'lucide-react';

export interface VRWaypoint {
  id: string;
  name: string;
  roomId: string;
  roomName: string;
  /** Position in the virtual scene [x, y, z] */
  position: [number, number, number];
  /** Look-at direction [x, y, z] */
  lookAt: [number, number, number];
}

interface VRWalkthroughProps {
  /** Available rooms to navigate between. */
  rooms: { id: string; name: string; type: string }[];
  /** Predefined waypoints for teleportation. */
  waypoints: VRWaypoint[];
  /** Currently active waypoint. */
  activeWaypointId: string | null;
  /** Callback when user teleports to a waypoint. */
  onTeleport: (waypointId: string) => void;
  /** Callback when user navigates to a different room. */
  onRoomChange: (roomId: string) => void;
  /** Current room ID. */
  currentRoomId: string;
  /** Whether VR session is active. */
  sessionActive: boolean;
}

export function VRWalkthrough({
  rooms,
  waypoints,
  activeWaypointId,
  onTeleport,
  onRoomChange,
  currentRoomId,
  sessionActive,
}: VRWalkthroughProps) {
  const [locomotionMode, setLocomotionMode] = useState<'teleport' | 'smooth'>('teleport');

  const currentRoom = rooms.find((r) => r.id === currentRoomId);
  const roomWaypoints = waypoints.filter((w) => w.roomId === currentRoomId);

  const currentWaypointIndex = roomWaypoints.findIndex((w) => w.id === activeWaypointId);

  const handlePrevWaypoint = useCallback(() => {
    if (roomWaypoints.length === 0) return;
    const prevIndex =
      currentWaypointIndex <= 0 ? roomWaypoints.length - 1 : currentWaypointIndex - 1;
    onTeleport(roomWaypoints[prevIndex].id);
  }, [roomWaypoints, currentWaypointIndex, onTeleport]);

  const handleNextWaypoint = useCallback(() => {
    if (roomWaypoints.length === 0) return;
    const nextIndex =
      currentWaypointIndex >= roomWaypoints.length - 1 ? 0 : currentWaypointIndex + 1;
    onTeleport(roomWaypoints[nextIndex].id);
  }, [roomWaypoints, currentWaypointIndex, onTeleport]);

  if (!sessionActive) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <Glasses className="h-16 w-16 text-muted-foreground" />
        <div className="text-center">
          <p className="font-medium">VR Room Walkthrough</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Put on your VR headset and explore your designed rooms in immersive 3D.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Footprints className="h-4 w-4" />
            <span>Teleport between waypoints using your controller</span>
          </div>
          <div className="flex items-center gap-2">
            <Navigation className="h-4 w-4" />
            <span>Navigate between rooms seamlessly</span>
          </div>
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            <span>Look around to explore every detail</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current location */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xs font-medium">{currentRoom?.name ?? 'Unknown Room'}</p>
                {activeWaypointId && (
                  <p className="text-[10px] text-muted-foreground">
                    {waypoints.find((w) => w.id === activeWaypointId)?.name ?? 'Custom position'}
                  </p>
                )}
              </div>
            </div>
            <Badge variant="secondary" className="text-[10px]">
              {locomotionMode === 'teleport' ? 'Teleport' : 'Smooth'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Locomotion mode */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Locomotion</p>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            className={cn(
              'flex flex-col items-center gap-1 rounded-md p-2 text-xs transition-colors',
              locomotionMode === 'teleport'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
            onClick={() => setLocomotionMode('teleport')}
          >
            <Footprints className="h-4 w-4" />
            Teleport
          </button>
          <button
            className={cn(
              'flex flex-col items-center gap-1 rounded-md p-2 text-xs transition-colors',
              locomotionMode === 'smooth'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
            onClick={() => setLocomotionMode('smooth')}
          >
            <Navigation className="h-4 w-4" />
            Smooth
          </button>
        </div>
      </div>

      {/* Waypoint navigation */}
      {roomWaypoints.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Waypoints</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handlePrevWaypoint}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 text-center">
              <p className="text-xs font-medium">
                {activeWaypointId
                  ? waypoints.find((w) => w.id === activeWaypointId)?.name
                  : 'Select a waypoint'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {currentWaypointIndex + 1} / {roomWaypoints.length}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handleNextWaypoint}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-2 space-y-1">
            {roomWaypoints.map((wp) => (
              <button
                key={wp.id}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                  activeWaypointId === wp.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-muted text-muted-foreground',
                )}
                onClick={() => onTeleport(wp.id)}
              >
                <MapPin className="h-3 w-3 shrink-0" />
                {wp.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Room navigation */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Rooms</p>
        <div className="space-y-1">
          {rooms.map((room) => (
            <button
              key={room.id}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-3 py-2 text-xs transition-colors',
                room.id === currentRoomId
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
              onClick={() => onRoomChange(room.id)}
            >
              <span>{room.name}</span>
              <span className="text-[10px] opacity-70">
                {room.type.replace(/_/g, ' ')}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Reset position */}
      <Button variant="outline" size="sm" className="w-full" onClick={handlePrevWaypoint}>
        <RotateCcw className="mr-1 h-4 w-4" />
        Reset Position
      </Button>
    </div>
  );
}
