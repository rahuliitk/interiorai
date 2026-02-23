'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { GRID_SIZES, type GridSizeValue } from '@/lib/snap-engine';

interface SnapGridProps {
  /** Room length in metres (X axis). */
  roomLengthM: number;
  /** Room width in metres (Z axis). */
  roomWidthM: number;
  /** Grid cell size in metres. */
  gridSize: GridSizeValue;
  /** Whether the grid is visible. */
  visible: boolean;
  /** Primary line color. */
  color?: string;
  /** Secondary line color (every N lines). */
  secondaryColor?: string;
}

export function SnapGrid({
  roomLengthM,
  roomWidthM,
  gridSize,
  visible,
  color = '#cccccc',
  secondaryColor = '#999999',
}: SnapGridProps) {
  const gridHelper = useMemo(() => {
    if (!visible) return null;

    const maxDim = Math.max(roomLengthM, roomWidthM);
    // Extend the grid slightly beyond the room
    const gridExtent = Math.ceil(maxDim / gridSize) * gridSize + gridSize * 2;
    const divisions = Math.round(gridExtent / gridSize);

    const vertices: number[] = [];
    const colors: number[] = [];

    const mainColor = new THREE.Color(color);
    const secColor = new THREE.Color(secondaryColor);
    const halfExtent = gridExtent / 2;

    // Determine secondary grid interval (every 5th or 10th line)
    const secInterval = gridSize <= 0.05 ? 10 : 5;

    for (let i = 0; i <= divisions; i++) {
      const pos = -halfExtent + i * gridSize;
      const isSecondary = i % secInterval === 0;
      const lineColor = isSecondary ? secColor : mainColor;

      // Line along Z
      vertices.push(pos, 0.001, -halfExtent, pos, 0.001, halfExtent);
      colors.push(lineColor.r, lineColor.g, lineColor.b, lineColor.r, lineColor.g, lineColor.b);

      // Line along X
      vertices.push(-halfExtent, 0.001, pos, halfExtent, 0.001, pos);
      colors.push(lineColor.r, lineColor.g, lineColor.b, lineColor.r, lineColor.g, lineColor.b);
    }

    return { vertices: new Float32Array(vertices), colors: new Float32Array(colors) };
  }, [roomLengthM, roomWidthM, gridSize, visible, color, secondaryColor]);

  if (!visible || !gridHelper) return null;

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[gridHelper.vertices, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[gridHelper.colors, 3]}
        />
      </bufferGeometry>
      <lineBasicMaterial vertexColors transparent opacity={0.5} />
    </lineSegments>
  );
}

interface SnapGridControlsProps {
  gridSize: GridSizeValue;
  onGridSizeChange: (size: GridSizeValue) => void;
  snapEnabled: boolean;
  onSnapToggle: () => void;
}

export function SnapGridControls({
  gridSize,
  onGridSizeChange,
  snapEnabled,
  onSnapToggle,
}: SnapGridControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
          snapEnabled
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground hover:bg-muted/80'
        }`}
        onClick={onSnapToggle}
      >
        Snap {snapEnabled ? 'ON' : 'OFF'}
      </button>
      <div className="flex gap-0.5">
        {GRID_SIZES.map((gs) => (
          <button
            key={gs.value}
            className={`rounded px-1.5 py-1 text-xs transition-colors ${
              gridSize === gs.value
                ? 'bg-primary/20 text-primary font-medium'
                : 'text-muted-foreground hover:bg-muted'
            }`}
            onClick={() => onGridSizeChange(gs.value)}
          >
            {gs.label}
          </button>
        ))}
      </div>
    </div>
  );
}
