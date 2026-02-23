import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { setupWebSocket } from './ws/connection';
import { commentsRouter } from './routes/comments';
import { approvalsRouter } from './routes/approvals';
import { notificationsRouter } from './routes/notifications';
import { verifyToken } from './auth';

const PORT = parseInt(process.env.PORT || '8009', 10);
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://openlintel:openlintel_dev@localhost:5432/openlintel';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const app = express();
const httpServer = createServer(app);

// Database pool
export const pool = new Pool({ connectionString: DATABASE_URL });

// Redis client
export const redis = createClient({ url: REDIS_URL });

// Socket.IO
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.WEB_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(cors({
  origin: process.env.WEB_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Auth middleware for REST routes
app.use('/api', async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const user = verifyToken(authHeader.slice(7));
    (req as any).userId = user.id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'collaboration' });
});

// REST routes
app.use('/api/v1/comments', commentsRouter);
app.use('/api/v1/approvals', approvalsRouter);
app.use('/api/v1/notifications', notificationsRouter);

// WebSocket setup
setupWebSocket(io);

async function start() {
  await redis.connect();
  console.log('Redis connected');

  await pool.query('SELECT 1');
  console.log('PostgreSQL connected');

  httpServer.listen(PORT, () => {
    console.log(`Collaboration service running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
