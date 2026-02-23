'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { buildRoomGeometry, DEFAULT_ROOM, type RoomDimensions, type WallOpening } from '@/lib/room-builder';

interface RoomGeometryProps {
  dimensions?: RoomDimensions;
  openings?: WallOpening[];
  wallColor?: string;
  floorColor?: string;
  showCeiling?: boolean;
  ceilingColor?: string;
  showGrid?: boolean;
}

/** A repeating grid texture for the floor. */
function useGridTexture(size: number, divisions: number, color1: string, color2: string) {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const cellSize = canvas.width / divisions;

    ctx.fillStyle = color1;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = color2;
    ctx.lineWidth = 1;
    for (let i = 0; i <= divisions; i++) {
      const pos = i * cellSize;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(canvas.width, pos);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(size / 2, size / 2);
    return texture;
  }, [size, divisions, color1, color2]);
}

export function RoomGeometry({
  dimensions = DEFAULT_ROOM,
  openings = [],
  wallColor = '#f5f0e8',
  floorColor = '#e8dcc8',
  showCeiling = false,
  ceilingColor = '#ffffff',
  showGrid = true,
}: RoomGeometryProps) {
  const room = useMemo(
    () => buildRoomGeometry(dimensions, openings),
    [dimensions, openings],
  );

  const floorTexture = useGridTexture(
    Math.max(room.lengthM, room.widthM),
    20,
    floorColor,
    '#ccc5b5',
  );

  return (
    <group>
      {/* Floor */}
      <mesh
        position={room.floor.position}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[room.floor.size[0], room.floor.size[1]]} />
        {showGrid ? (
          <meshStandardMaterial map={floorTexture} roughness={0.8} metalness={0.0} />
        ) : (
          <meshStandardMaterial color={floorColor} roughness={0.8} metalness={0.0} />
        )}
      </mesh>

      {/* Ceiling */}
      {showCeiling && (
        <mesh
          position={room.ceiling.position}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[room.ceiling.size[0], room.ceiling.size[1]]} />
          <meshStandardMaterial
            color={ceilingColor}
            roughness={0.9}
            metalness={0.0}
            side={THREE.BackSide}
          />
        </mesh>
      )}

      {/* Walls */}
      {room.walls.map((wall, idx) => (
        <mesh
          key={idx}
          position={wall.position}
          rotation={[0, wall.rotationY, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={wall.size} />
          <meshStandardMaterial
            color={wallColor}
            roughness={0.85}
            metalness={0.0}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
