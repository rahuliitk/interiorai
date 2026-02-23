import { Server as SocketIOServer, Socket } from 'socket.io';

interface CursorPosition {
  userId: string;
  userName: string;
  x: number;
  y: number;
  page?: string;
  color: string;
}

// Assign colors to users for presence indicators
const COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
];

let colorIndex = 0;
function getNextColor(): string {
  const color = COLORS[colorIndex % COLORS.length];
  colorIndex++;
  return color;
}

const userColors = new Map<string, string>();

export function setupAwareness(socket: Socket & { userId?: string; userName?: string }, io: SocketIOServer) {
  const userId = socket.userId || 'anonymous';

  if (!userColors.has(userId)) {
    userColors.set(userId, getNextColor());
  }

  // User cursor movement
  socket.on('cursor:move', (data: { projectId: string; x: number; y: number; page?: string }) => {
    const position: CursorPosition = {
      userId,
      userName: socket.userName || 'Anonymous',
      x: data.x,
      y: data.y,
      page: data.page,
      color: userColors.get(userId) || '#3B82F6',
    };
    socket.to(`project:${data.projectId}`).emit('cursor:update', position);
  });

  // Selection state
  socket.on('selection:change', (data: { projectId: string; selection: any }) => {
    socket.to(`project:${data.projectId}`).emit('selection:update', {
      userId,
      userName: socket.userName,
      selection: data.selection,
      color: userColors.get(userId) || '#3B82F6',
    });
  });

  // Typing indicator
  socket.on('typing:start', (data: { projectId: string; context: string }) => {
    socket.to(`project:${data.projectId}`).emit('typing:started', {
      userId,
      userName: socket.userName,
      context: data.context,
    });
  });

  socket.on('typing:stop', (data: { projectId: string }) => {
    socket.to(`project:${data.projectId}`).emit('typing:stopped', {
      userId,
    });
  });
}
