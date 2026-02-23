'use client';

import { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Stats } from '@react-three/drei';
import { Skeleton } from '@openlintel/ui';

interface SceneProps {
  children: React.ReactNode;
  /** Show FPS stats panel (dev mode). */
  showStats?: boolean;
  /** Environment preset for reflections / ambient. */
  environmentPreset?: 'apartment' | 'city' | 'dawn' | 'forest' | 'lobby' | 'night' | 'park' | 'studio' | 'sunset' | 'warehouse';
}

function LoadingFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted/30">
      <div className="space-y-3 text-center">
        <Skeleton className="mx-auto h-12 w-12 rounded-full" />
        <p className="text-sm text-muted-foreground">Loading 3D scene...</p>
      </div>
    </div>
  );
}

export function Scene({
  children,
  showStats = false,
  environmentPreset = 'apartment',
}: SceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <Suspense fallback={<LoadingFallback />}>
        <Canvas
          shadows
          camera={{ position: [5, 5, 5], fov: 50, near: 0.1, far: 100 }}
          gl={{ antialias: true, alpha: false }}
          style={{ background: '#f0f0f0' }}
        >
          {/* Lighting */}
          <ambientLight intensity={0.4} />
          <directionalLight
            position={[5, 8, 5]}
            intensity={1.0}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-far={50}
            shadow-camera-left={-10}
            shadow-camera-right={10}
            shadow-camera-top={10}
            shadow-camera-bottom={-10}
          />
          <directionalLight position={[-3, 4, -5]} intensity={0.3} />

          {/* Environment map for reflections */}
          <Environment preset={environmentPreset} />

          {/* Scene content */}
          {children}

          {/* Dev-mode stats panel */}
          {showStats && <Stats />}
        </Canvas>
      </Suspense>
    </div>
  );
}
