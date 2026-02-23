/**
 * Y.js + Socket.IO collaboration session for the 3D editor.
 *
 * Connects to the collaboration service (port 8010) and syncs
 * furniture state via a Y.Map keyed by furniture ID.
 */

import * as Y from 'yjs';
import { io, type Socket } from 'socket.io-client';

const COLLAB_SERVICE_URL =
  process.env.NEXT_PUBLIC_COLLAB_SERVICE_URL || 'http://localhost:8010';

export interface CollabSession {
  doc: Y.Doc;
  furnitureMap: Y.Map<unknown>;
  socket: Socket;
  destroy: () => void;
}

export function createCollabSession(
  projectId: string,
  userId: string,
): CollabSession {
  const doc = new Y.Doc();
  const furnitureMap = doc.getMap('furniture');

  const socket = io(COLLAB_SERVICE_URL, {
    query: { projectId, userId },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  // ─── Send local updates to server ──────────────────────────
  const updateHandler = (update: Uint8Array, origin: unknown) => {
    // Only send updates that originated locally (not from server)
    if (origin !== 'remote') {
      socket.emit('yjs:update', {
        projectId,
        update: Array.from(update),
      });
    }
  };
  doc.on('update', updateHandler);

  // ─── Receive remote updates ────────────────────────────────
  socket.on('yjs:update', (data: { update: number[] }) => {
    const update = new Uint8Array(data.update);
    Y.applyUpdate(doc, update, 'remote');
  });

  // ─── Initial state sync ────────────────────────────────────
  socket.on('yjs:sync', (data: { state: number[] }) => {
    if (data.state && data.state.length > 0) {
      const state = new Uint8Array(data.state);
      Y.applyUpdate(doc, state, 'remote');
    }
  });

  // On connect, request the current document state
  socket.on('connect', () => {
    const stateVector = Y.encodeStateVector(doc);
    socket.emit('yjs:sync-request', {
      projectId,
      stateVector: Array.from(stateVector),
    });
  });

  // ─── Cleanup ───────────────────────────────────────────────
  const destroy = () => {
    doc.off('update', updateHandler);
    socket.disconnect();
    doc.destroy();
  };

  return { doc, furnitureMap, socket, destroy };
}
