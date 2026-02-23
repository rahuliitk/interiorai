'use client';

import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import type { PlacedFurniture } from '@/lib/gltf-loader';
import { snapPositionToGrid, snapToWall, clampToRoom } from '@/lib/snap-engine';

interface FurnitureObjectProps {
  item: PlacedFurniture;
  isSelected: boolean;
  activeTool: 'select' | 'move' | 'rotate' | 'scale';
  gridSize: number;
  snapEnabled: boolean;
  roomLengthM: number;
  roomWidthM: number;
  onSelect: (id: string) => void;
  onMove: (id: string, position: [number, number, number]) => void;
  onRotate?: (id: string, rotation: [number, number, number]) => void;
  onScale?: (id: string, scale: [number, number, number]) => void;
}

export function FurnitureObject({
  item,
  isSelected,
  activeTool,
  gridSize,
  snapEnabled,
  roomLengthM,
  roomWidthM,
  onSelect,
  onMove,
  onRotate,
  onScale,
}: FurnitureObjectProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const transformRef = useRef<any>(null);
  const [hovered, setHovered] = useState(false);

  // Determine transform mode from active tool
  const transformMode =
    activeTool === 'rotate' ? 'rotate' : activeTool === 'scale' ? 'scale' : 'translate';

  // Handle transform changes
  useEffect(() => {
    if (!transformRef.current || !isSelected) return;

    const controls = transformRef.current;

    const handleChange = () => {
      if (!meshRef.current) return;
      const obj = controls.object;
      if (!obj) return;

      if (transformMode === 'translate') {
        let pos = { x: obj.position.x, y: obj.position.y, z: obj.position.z };

        if (snapEnabled) {
          pos = snapPositionToGrid(pos, gridSize);
          pos = snapToWall(pos, roomLengthM, roomWidthM);
        }

        pos = clampToRoom(pos, roomLengthM, roomWidthM, item.size[0] / 2, item.size[2] / 2);

        obj.position.set(pos.x, Math.max(item.size[1] / 2, pos.y), pos.z);
        onMove(item.id, [pos.x, Math.max(item.size[1] / 2, pos.y), pos.z]);
      } else if (transformMode === 'rotate' && onRotate) {
        onRotate(item.id, [obj.rotation.x, obj.rotation.y, obj.rotation.z]);
      } else if (transformMode === 'scale' && onScale) {
        onScale(item.id, [obj.scale.x, obj.scale.y, obj.scale.z]);
      }
    };

    controls.addEventListener('objectChange', handleChange);
    return () => {
      controls.removeEventListener('objectChange', handleChange);
    };
  }, [
    isSelected,
    transformMode,
    snapEnabled,
    gridSize,
    roomLengthM,
    roomWidthM,
    item.id,
    item.size,
    onMove,
    onRotate,
    onScale,
  ]);

  // Hover cursor feedback
  useFrame(() => {
    if (meshRef.current) {
      document.body.style.cursor = hovered ? 'pointer' : 'auto';
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(item.id);
  };

  // Highlight colour
  const baseColor = new THREE.Color(item.color);
  const highlightColor = isSelected
    ? new THREE.Color('#3b82f6')
    : hovered
      ? baseColor.clone().lerp(new THREE.Color('#ffffff'), 0.2)
      : baseColor;

  const furnitureMesh = (
    <mesh
      ref={meshRef}
      position={item.position}
      rotation={item.rotation}
      scale={item.scale}
      castShadow
      receiveShadow
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={item.size} />
      <meshStandardMaterial
        color={highlightColor}
        roughness={0.6}
        metalness={0.1}
        transparent={isSelected}
        opacity={isSelected ? 0.9 : 1.0}
      />

      {/* Selection outline */}
      {isSelected && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(...item.size)]} />
          <lineBasicMaterial color="#3b82f6" linewidth={2} />
        </lineSegments>
      )}

      {/* Name label - show on hover or selected */}
      {(hovered || isSelected) && (
        <sprite position={[0, item.size[1] / 2 + 0.3, 0]} scale={[1.5, 0.3, 1]}>
          <spriteMaterial
            color="#ffffff"
            opacity={0.85}
            transparent
          />
        </sprite>
      )}
    </mesh>
  );

  if (isSelected && (activeTool === 'move' || activeTool === 'rotate' || activeTool === 'scale')) {
    return (
      <TransformControls
        ref={transformRef}
        object={meshRef}
        mode={transformMode}
        size={0.6}
        translationSnap={snapEnabled ? gridSize : undefined}
        rotationSnap={snapEnabled ? Math.PI / 12 : undefined}
      >
        {furnitureMesh}
      </TransformControls>
    );
  }

  return furnitureMesh;
}
