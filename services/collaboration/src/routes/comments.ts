import { Router } from 'express';
import { pool } from '../index';
import { v4 as uuid } from 'uuid';

export const commentsRouter = Router();

// List comments for a target
commentsRouter.get('/', async (req, res) => {
  const { target_type, target_id, project_id } = req.query;
  if (!target_type || !target_id || !project_id) {
    res.status(400).json({ error: 'target_type, target_id, and project_id required' });
    return;
  }

  const result = await pool.query(
    `SELECT c.*, u.name as user_name, u.image as user_image
     FROM comments c
     LEFT JOIN users u ON c.user_id = u.id
     WHERE c.target_type = $1 AND c.target_id = $2 AND c.project_id = $3
     ORDER BY c.created_at ASC`,
    [target_type, target_id, project_id],
  );

  res.json(result.rows);
});

// Create comment
commentsRouter.post('/', async (req, res) => {
  const userId = (req as any).userId;
  const { project_id, target_type, target_id, content, parent_id } = req.body;

  if (!project_id || !target_type || !target_id || !content) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const id = uuid();
  const result = await pool.query(
    `INSERT INTO comments (id, user_id, project_id, target_type, target_id, content, parent_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     RETURNING *`,
    [id, userId, project_id, target_type, target_id, content, parent_id || null],
  );

  res.status(201).json(result.rows[0]);
});

// Resolve comment
commentsRouter.patch('/:id/resolve', async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    `UPDATE comments SET resolved = true, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id],
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Comment not found' });
    return;
  }

  res.json(result.rows[0]);
});

// Delete comment
commentsRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = (req as any).userId;

  const result = await pool.query(
    `DELETE FROM comments WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId],
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Comment not found or not authorized' });
    return;
  }

  res.json({ success: true });
});
