'use client';

import { useState, useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { Badge } from '@openlintel/ui';

interface ConnectedUser {
  userId: string;
  joinedAt: number;
}

const AVATAR_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ef4444', '#06b6d4', '#ec4899', '#14b8a6',
];

function getColorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? '#3b82f6';
}

export function CollabPresence({
  socket,
  currentUserId,
}: {
  socket: Socket | null;
  currentUserId: string;
}) {
  const [users, setUsers] = useState<ConnectedUser[]>([]);

  useEffect(() => {
    if (!socket) return;

    const handleUserJoined = (data: { userId: string }) => {
      setUsers((prev) => {
        if (prev.some((u) => u.userId === data.userId)) return prev;
        return [...prev, { userId: data.userId, joinedAt: Date.now() }];
      });
    };

    const handleUserLeft = (data: { userId: string }) => {
      setUsers((prev) => prev.filter((u) => u.userId !== data.userId));
    };

    const handleUserList = (data: { users: string[] }) => {
      setUsers(
        data.users.map((userId) => ({
          userId,
          joinedAt: Date.now(),
        })),
      );
    };

    socket.on('user:joined', handleUserJoined);
    socket.on('user:left', handleUserLeft);
    socket.on('user:list', handleUserList);

    return () => {
      socket.off('user:joined', handleUserJoined);
      socket.off('user:left', handleUserLeft);
      socket.off('user:list', handleUserList);
    };
  }, [socket]);

  const otherUsers = users.filter((u) => u.userId !== currentUserId);

  if (otherUsers.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {otherUsers.map((user) => {
        const color = getColorForUser(user.userId);
        const initials = user.userId.slice(0, 2).toUpperCase();

        return (
          <div
            key={user.userId}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: color }}
            title={`User ${user.userId.slice(0, 8)}`}
          >
            {initials}
          </div>
        );
      })}
      <Badge variant="secondary" className="text-[10px] px-1.5">
        {otherUsers.length + 1} online
      </Badge>
    </div>
  );
}
