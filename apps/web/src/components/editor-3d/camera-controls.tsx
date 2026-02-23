'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls as DreiOrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface CameraControlsProps {
  /** Current requested view preset. Change this to animate to a view. */
  viewPreset?: 'perspective' | 'top' | 'front';
  /** Room dimensions in metres for "fit to room" calculation. */
  roomLengthM?: number;
  roomWidthM?: number;
  roomHeightM?: number;
  /** Disable orbit interaction (e.g. when dragging furniture). */
  enabled?: boolean;
}

const VIEW_POSITIONS: Record<string, THREE.Vector3> = {
  perspective: new THREE.Vector3(5, 5, 5),
  top: new THREE.Vector3(0, 10, 0.01), // Tiny Z offset to avoid gimbal lock
  front: new THREE.Vector3(0, 1.5, 8),
};

const VIEW_TARGETS: Record<string, THREE.Vector3> = {
  perspective: new THREE.Vector3(0, 0, 0),
  top: new THREE.Vector3(0, 0, 0),
  front: new THREE.Vector3(0, 1.5, 0),
};

export function CameraControls({
  viewPreset = 'perspective',
  roomLengthM = 4,
  roomWidthM = 3,
  roomHeightM = 2.8,
  enabled = true,
}: CameraControlsProps) {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const lastPresetRef = useRef(viewPreset);

  const animateToView = useCallback(
    (preset: string) => {
      const targetPos = VIEW_POSITIONS[preset];
      const targetLookAt = VIEW_TARGETS[preset];
      if (!targetPos || !targetLookAt) return;

      // Scale camera distance based on room size
      const roomDiagonal = Math.sqrt(
        roomLengthM * roomLengthM + roomWidthM * roomWidthM + roomHeightM * roomHeightM,
      );
      const scaleFactor = roomDiagonal / 6; // Normalize to default room size

      const scaledPos = targetPos.clone().multiplyScalar(scaleFactor);

      // Animate position
      const startPos = camera.position.clone();
      const startTime = performance.now();
      const duration = 500;

      function animate() {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3); // Ease-out cubic

        camera.position.lerpVectors(startPos, scaledPos, ease);

        if (controlsRef.current) {
          controlsRef.current.target.lerp(targetLookAt, ease);
          controlsRef.current.update();
        }

        if (t < 1) {
          requestAnimationFrame(animate);
        }
      }

      animate();
    },
    [camera, roomLengthM, roomWidthM, roomHeightM],
  );

  // React to view preset changes
  useEffect(() => {
    if (viewPreset !== lastPresetRef.current) {
      lastPresetRef.current = viewPreset;
      animateToView(viewPreset);
    }
  }, [viewPreset, animateToView]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keyboard shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 't':
          animateToView('top');
          break;
        case 'f':
          animateToView('front');
          break;
        case 'p':
          animateToView('perspective');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [animateToView]);

  return (
    <DreiOrbitControls
      ref={controlsRef}
      enabled={enabled}
      enableDamping
      dampingFactor={0.1}
      minDistance={1}
      maxDistance={30}
      maxPolarAngle={Math.PI / 2 - 0.05} // Prevent camera going below floor
      minPolarAngle={0.1}
      enablePan
      panSpeed={1}
      rotateSpeed={0.8}
      zoomSpeed={1.2}
      makeDefault
    />
  );
}
