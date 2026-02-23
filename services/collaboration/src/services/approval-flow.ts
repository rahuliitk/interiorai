import { pool } from '../index';

/**
 * Approval state machine.
 *
 * States: pending → approved | rejected | revision_requested
 *
 * Transitions:
 *   pending → approved (by reviewer)
 *   pending → rejected (by reviewer)
 *   pending → revision_requested (by reviewer)
 *   revision_requested → pending (by requester resubmitting)
 */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'revision_requested';

const VALID_TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  pending: ['approved', 'rejected', 'revision_requested'],
  revision_requested: ['pending'],
  approved: [],
  rejected: ['pending'],
};

export function canTransition(from: ApprovalStatus, to: ApprovalStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function transitionApproval(
  approvalId: string,
  newStatus: ApprovalStatus,
  reviewerId: string,
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  // Get current status
  const result = await pool.query(
    'SELECT status FROM approvals WHERE id = $1',
    [approvalId],
  );

  if (result.rows.length === 0) {
    return { success: false, error: 'Approval not found' };
  }

  const currentStatus = result.rows[0].status as ApprovalStatus;

  if (!canTransition(currentStatus, newStatus)) {
    return {
      success: false,
      error: `Cannot transition from ${currentStatus} to ${newStatus}`,
    };
  }

  await pool.query(
    `UPDATE approvals
     SET status = $1, reviewed_by = $2, reviewed_at = NOW(), notes = $3
     WHERE id = $4`,
    [newStatus, reviewerId, notes || null, approvalId],
  );

  return { success: true };
}
