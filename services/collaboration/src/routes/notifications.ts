import { Router } from 'express';
import { pool } from '../index';
import { v4 as uuid } from 'uuid';

export const notificationsRouter = Router();

// List notifications for current user
notificationsRouter.get('/', async (req, res) => {
  const userId = (req as any).userId;
  const { unread_only, limit } = req.query;

  let query = `SELECT * FROM notifications WHERE user_id = $1`;
  const params: any[] = [userId];

  if (unread_only === 'true') {
    query += ` AND read = false`;
  }

  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(parseInt(limit as string) || 50);

  const result = await pool.query(query, params);
  res.json(result.rows);
});

// Get unread count
notificationsRouter.get('/unread-count', async (req, res) => {
  const userId = (req as any).userId;
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = false`,
    [userId],
  );
  res.json({ count: parseInt(result.rows[0].count) });
});

// Create notification (internal use / service-to-service)
notificationsRouter.post('/', async (req, res) => {
  const { user_id, type, title, message, link } = req.body;

  if (!user_id || !type || !title) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const id = uuid();
  const result = await pool.query(
    `INSERT INTO notifications (id, user_id, type, title, message, link, read, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, false, NOW())
     RETURNING *`,
    [id, user_id, type, title, message || null, link || null],
  );

  res.status(201).json(result.rows[0]);
});

// Mark notification as read
notificationsRouter.patch('/:id/read', async (req, res) => {
  const { id } = req.params;
  const userId = (req as any).userId;

  await pool.query(
    `UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );

  res.json({ success: true });
});

// Mark all as read
notificationsRouter.patch('/read-all', async (req, res) => {
  const userId = (req as any).userId;

  await pool.query(
    `UPDATE notifications SET read = true WHERE user_id = $1`,
    [userId],
  );

  res.json({ success: true });
});
