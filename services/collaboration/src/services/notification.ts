import { pool } from '../index';
import { redis } from '../index';
import { v4 as uuid } from 'uuid';

export interface CreateNotificationParams {
  userId: string;
  type: string;
  title: string;
  message?: string;
  link?: string;
}

/**
 * Create a notification and publish it via Redis pub/sub
 * so the WebSocket server can push it in real-time.
 */
export async function createNotification(params: CreateNotificationParams) {
  const id = uuid();

  await pool.query(
    `INSERT INTO notifications (id, user_id, type, title, message, link, read, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, false, NOW())`,
    [id, params.userId, params.type, params.title, params.message || null, params.link || null],
  );

  // Publish to Redis for real-time delivery
  await redis.publish(
    `notification:${params.userId}`,
    JSON.stringify({ id, ...params }),
  );

  return id;
}

/**
 * Send notifications for common events.
 */
export async function notifyCommentAdded(
  projectId: string,
  commenterId: string,
  commenterName: string,
  targetType: string,
  targetId: string,
) {
  // Find project owner
  const result = await pool.query(
    'SELECT user_id FROM projects WHERE id = $1',
    [projectId],
  );
  if (result.rows.length === 0) return;

  const ownerId = result.rows[0].user_id;
  if (ownerId === commenterId) return; // Don't notify yourself

  await createNotification({
    userId: ownerId,
    type: 'comment',
    title: `${commenterName} commented on your ${targetType}`,
    link: `/project/${projectId}`,
  });
}

export async function notifyApprovalRequested(
  projectId: string,
  requesterId: string,
  requesterName: string,
  targetType: string,
) {
  const result = await pool.query(
    'SELECT user_id FROM projects WHERE id = $1',
    [projectId],
  );
  if (result.rows.length === 0) return;

  const ownerId = result.rows[0].user_id;
  await createNotification({
    userId: ownerId,
    type: 'approval',
    title: `${requesterName} requested approval for ${targetType}`,
    link: `/project/${projectId}`,
  });
}

export async function notifyJobComplete(
  userId: string,
  jobType: string,
  projectId: string,
) {
  const typeLabels: Record<string, string> = {
    design_generation: 'Design generation',
    bom_calculation: 'BOM calculation',
    drawing_generation: 'Drawing generation',
    cutlist_generation: 'Cut list generation',
    schedule_generation: 'Schedule generation',
  };

  const label = typeLabels[jobType] || jobType;
  await createNotification({
    userId,
    type: 'job_complete',
    title: `${label} completed`,
    link: `/project/${projectId}`,
  });
}
