'use client';

import { useState, useEffect, useRef } from 'react';
import { Html } from '@react-three/drei';
import type { Socket } from 'socket.io-client';

interface CursorState {
  userId: string;
  userName: string;
  x: number;
  y: number;
  z?: number;
  color: string;
  lastUpdate: number;
}

interface SelectionState {
  userId: string;
  userName: string;
  objectId: string;
  color: string;
}

const CURSOR_TIMEOUT_MS = 10_000; // Remove stale cursors after 10s

export function CollabCursors({
  socket,
  currentUserId,
}: {
  socket: Socket | null;
  currentUserId: string;
}) {
  const [cursors, setCursors] = useState<Map<string, CursorState>>(new Map());
  const [, setSelections] = useState<Map<string, SelectionState>>(new Map());
  const cleanupRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!socket) return;

    const handleCursorUpdate = (data: {
      userId: string;
      userName?: string;
      x: number;
      y: number;
      z?: number;
      color?: string;
    }) => {
      if (data.userId === currentUserId) return;
      setCursors((prev) => {
        const next = new Map(prev);
        next.set(data.userId, {
          userId: data.userId,
          userName: data.userName || data.userId.slice(0, 8),
          x: data.x,
          y: data.y,
          z: data.z ?? 0,
          color: data.color || '#3b82f6',
          lastUpdate: Date.now(),
        });
        return next;
      });
    };

    const handleSelectionUpdate = (data: {
      userId: string;
      userName?: string;
      objectId: string;
      color?: string;
    }) => {
      if (data.userId === currentUserId) return;
      setSelections((prev) => {
        const next = new Map(prev);
        if (data.objectId) {
          next.set(data.userId, {
            userId: data.userId,
            userName: data.userName || data.userId.slice(0, 8),
            objectId: data.objectId,
            color: data.color || '#3b82f6',
          });
        } else {
          next.delete(data.userId);
        }
        return next;
      });
    };

    const handleUserLeft = (data: { userId: string }) => {
      setCursors((prev) => {
        const next = new Map(prev);
        next.delete(data.userId);
        return next;
      });
      setSelections((prev) => {
        const next = new Map(prev);
        next.delete(data.userId);
        return next;
      });
    };

    socket.on('cursor:update', handleCursorUpdate);
    socket.on('selection:update', handleSelectionUpdate);
    socket.on('user:left', handleUserLeft);

    // Clean up stale cursors
    cleanupRef.current = setInterval(() => {
      const now = Date.now();
      setCursors((prev) => {
        const next = new Map(prev);
        for (const [key, cursor] of next) {
          if (now - cursor.lastUpdate > CURSOR_TIMEOUT_MS) {
            next.delete(key);
          }
        }
        return next.size !== prev.size ? next : prev;
      });
    }, 5000);

    return () => {
      socket.off('cursor:update', handleCursorUpdate);
      socket.off('selection:update', handleSelectionUpdate);
      socket.off('user:left', handleUserLeft);
      if (cleanupRef.current) clearInterval(cleanupRef.current);
    };
  }, [socket, currentUserId]);

  const cursorArray = Array.from(cursors.values());

  if (cursorArray.length === 0) return null;

  return (
    <group>
      {cursorArray.map((cursor) => (
        <group key={cursor.userId} position={[cursor.x, 0.05, cursor.z || cursor.y]}>
          {/* Cursor dot on the floor plane */}
          <mesh>
            <sphereGeometry args={[0.04, 16, 16]} />
            <meshBasicMaterial color={cursor.color} />
          </mesh>
          {/* Label floating above */}
          <Html position={[0, 0.15, 0]} center style={{ pointerEvents: 'none' }}>
            <div
              className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow-md"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.userName}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

/** Emit cursor position from the current user */
export function useCollabCursorEmitter(
  socket: Socket | null,
  projectId: string,
) {
  const lastEmit = useRef(0);

  return (worldX: number, worldZ: number) => {
    if (!socket) return;
    const now = Date.now();
    // Throttle to 15fps
    if (now - lastEmit.current < 66) return;
    lastEmit.current = now;
    socket.emit('cursor:move', {
      projectId,
      x: worldX,
      y: worldZ,
      page: '3d-editor',
    });
  };
}

/** Emit selection change from the current user */
export function useCollabSelectionEmitter(socket: Socket | null) {
  return (objectId: string | null) => {
    if (!socket) return;
    socket.emit('selection:change', { objectId: objectId || '' });
  };
}
