import { z } from 'zod';
import { router, protectedProcedure } from '../init';
import {
  qualityCheckpoints, punchListItems, projects, eq, and, count, desc,
} from '@openlintel/db';

export const qualityRouter = router({
  // ── Create quality checkpoint ────────────────────────────
  createCheckpoint: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      milestone: z.string().min(1),
      title: z.string().min(1),
      description: z.string().optional(),
      trade: z.string().optional(),
      checklistItems: z.array(z.object({ item: z.string(), checked: z.boolean(), note: z.string().optional() })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');
      const [cp] = await ctx.db.insert(qualityCheckpoints).values({
        projectId: input.projectId,
        milestone: input.milestone,
        title: input.title,
        description: input.description ?? null,
        trade: input.trade ?? null,
        checklistItems: input.checklistItems ?? null,
      }).returning();
      return cp;
    }),

  // ── List checkpoints ─────────────────────────────────────
  listCheckpoints: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');
      return ctx.db.query.qualityCheckpoints.findMany({
        where: eq(qualityCheckpoints.projectId, input.projectId),
        orderBy: (qc, { desc }) => [desc(qc.createdAt)],
      });
    }),

  // ── Update checkpoint ────────────────────────────────────
  updateCheckpoint: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(['pending', 'in_progress', 'passed', 'failed']).optional(),
      checklistItems: z.array(z.object({ item: z.string(), checked: z.boolean(), note: z.string().optional() })).optional(),
      notes: z.string().optional(),
      photoKeys: z.array(z.string()).optional(),
      inspectedBy: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const cp = await ctx.db.query.qualityCheckpoints.findFirst({
        where: eq(qualityCheckpoints.id, input.id),
        with: { project: true },
      });
      if (!cp) throw new Error('Checkpoint not found');
      if ((cp.project as any).userId !== ctx.userId) throw new Error('Access denied');
      const { id, ...data } = input;
      const updates: any = { ...data, updatedAt: new Date() };
      if (input.status === 'passed' || input.status === 'failed') {
        updates.inspectedAt = new Date();
      }
      const [updated] = await ctx.db.update(qualityCheckpoints).set(updates).where(eq(qualityCheckpoints.id, id)).returning();
      return updated;
    }),

  // ── Delete checkpoint ────────────────────────────────────
  deleteCheckpoint: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cp = await ctx.db.query.qualityCheckpoints.findFirst({
        where: eq(qualityCheckpoints.id, input.id),
        with: { project: true },
      });
      if (!cp) throw new Error('Checkpoint not found');
      if ((cp.project as any).userId !== ctx.userId) throw new Error('Access denied');
      await ctx.db.delete(qualityCheckpoints).where(eq(qualityCheckpoints.id, input.id));
      return { success: true };
    }),

  // ── Create punch list item ───────────────────────────────
  createPunchItem: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      roomId: z.string().optional(),
      title: z.string().min(1),
      description: z.string().optional(),
      severity: z.enum(['critical', 'major', 'minor', 'observation']).optional(),
      category: z.string().optional(),
      assignedTo: z.string().optional(),
      photoKeys: z.array(z.string()).optional(),
      locationPin: z.object({ x: z.number(), y: z.number(), floorPlanId: z.string().optional() }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');
      const [item] = await ctx.db.insert(punchListItems).values({
        projectId: input.projectId,
        roomId: input.roomId ?? null,
        title: input.title,
        description: input.description ?? null,
        severity: input.severity ?? 'minor',
        category: input.category ?? null,
        assignedTo: input.assignedTo ?? null,
        photoKeys: input.photoKeys ?? null,
        locationPin: input.locationPin ?? null,
      }).returning();
      return item;
    }),

  // ── List punch list items ────────────────────────────────
  listPunchItems: protectedProcedure
    .input(z.object({ projectId: z.string(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');
      const conditions = [eq(punchListItems.projectId, input.projectId)];
      if (input.status) conditions.push(eq(punchListItems.status, input.status));
      return ctx.db.query.punchListItems.findMany({
        where: and(...conditions),
        orderBy: (p, { desc }) => [desc(p.createdAt)],
      });
    }),

  // ── Update punch list item ───────────────────────────────
  updatePunchItem: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(['open', 'in_progress', 'resolved', 'verified', 'reopened']).optional(),
      severity: z.enum(['critical', 'major', 'minor', 'observation']).optional(),
      assignedTo: z.string().optional(),
      photoKeys: z.array(z.string()).optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.query.punchListItems.findFirst({
        where: eq(punchListItems.id, input.id),
        with: { project: true },
      });
      if (!item) throw new Error('Item not found');
      if ((item.project as any).userId !== ctx.userId) throw new Error('Access denied');
      const { id, ...data } = input;
      const updates: any = { ...data, updatedAt: new Date() };
      if (input.status === 'resolved') updates.resolvedAt = new Date();
      if (input.status === 'verified') updates.verifiedAt = new Date();
      const [updated] = await ctx.db.update(punchListItems).set(updates).where(eq(punchListItems.id, id)).returning();
      return updated;
    }),

  // ── Delete punch list item ───────────────────────────────
  deletePunchItem: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.query.punchListItems.findFirst({
        where: eq(punchListItems.id, input.id),
        with: { project: true },
      });
      if (!item) throw new Error('Item not found');
      if ((item.project as any).userId !== ctx.userId) throw new Error('Access denied');
      await ctx.db.delete(punchListItems).where(eq(punchListItems.id, input.id));
      return { success: true };
    }),

  // ── Dashboard summary ────────────────────────────────────
  getDashboard: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');
      const checkpoints = await ctx.db.query.qualityCheckpoints.findMany({
        where: eq(qualityCheckpoints.projectId, input.projectId),
      });
      const punchItems = await ctx.db.query.punchListItems.findMany({
        where: eq(punchListItems.projectId, input.projectId),
      });
      const cpByStatus = { pending: 0, in_progress: 0, passed: 0, failed: 0 };
      checkpoints.forEach((c) => { cpByStatus[c.status as keyof typeof cpByStatus] = (cpByStatus[c.status as keyof typeof cpByStatus] || 0) + 1; });
      const piByStatus = { open: 0, in_progress: 0, resolved: 0, verified: 0, reopened: 0 };
      punchItems.forEach((p) => { piByStatus[p.status as keyof typeof piByStatus] = (piByStatus[p.status as keyof typeof piByStatus] || 0) + 1; });
      const piBySeverity = { critical: 0, major: 0, minor: 0, observation: 0 };
      punchItems.forEach((p) => { piBySeverity[p.severity as keyof typeof piBySeverity] = (piBySeverity[p.severity as keyof typeof piBySeverity] || 0) + 1; });
      return {
        checkpoints: { total: checkpoints.length, byStatus: cpByStatus },
        punchItems: { total: punchItems.length, byStatus: piByStatus, bySeverity: piBySeverity },
      };
    }),
});
