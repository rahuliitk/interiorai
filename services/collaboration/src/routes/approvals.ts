import { Router } from 'express';
import { pool } from '../index';
import { v4 as uuid } from 'uuid';

export const approvalsRouter = Router();

// List approvals for a project
approvalsRouter.get('/', async (req, res) => {
  const { project_id } = req.query;
  if (!project_id) {
    res.status(400).json({ error: 'project_id required' });
    return;
  }

  const result = await pool.query(
    `SELECT a.*, u.name as requester_name
     FROM approvals a
     LEFT JOIN users u ON a.requested_by = u.id
     WHERE a.project_id = $1
     ORDER BY a.created_at DESC`,
    [project_id],
  );

  res.json(result.rows);
});

// Request approval
approvalsRouter.post('/', async (req, res) => {
  const userId = (req as any).userId;
  const { project_id, target_type, target_id } = req.body;

  if (!project_id || !target_type || !target_id) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const id = uuid();
  const result = await pool.query(
    `INSERT INTO approvals (id, project_id, requested_by, target_type, target_id, status, created_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
     RETURNING *`,
    [id, project_id, userId, target_type, target_id],
  );

  res.status(201).json(result.rows[0]);
});

// Review approval (approve/reject)
approvalsRouter.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = (req as any).userId;
  const { status, notes } = req.body;

  if (!['approved', 'rejected', 'revision_requested'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const result = await pool.query(
    `UPDATE approvals
     SET status = $1, reviewed_by = $2, reviewed_at = NOW(), notes = $3
     WHERE id = $4
     RETURNING *`,
    [status, userId, notes || null, id],
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Approval not found' });
    return;
  }

  res.json(result.rows[0]);
});
