import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { notifications, comments, approvals, projects } from '@openlintel/db';
import { router, protectedProcedure } from '../init';

export const notificationRouter = router({
  // ── Notifications ──────────────────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
        unreadOnly: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = input.unreadOnly
        ? and(eq(notifications.userId, ctx.userId), eq(notifications.read, false))
        : eq(notifications.userId, ctx.userId);

      return ctx.db.query.notifications.findMany({
        where,
        orderBy: (n, { desc }) => [desc(n.createdAt)],
        limit: input.limit,
      });
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const result = await ctx.db
      .select({ count: notifications.id })
      .from(notifications)
      .where(
        and(eq(notifications.userId, ctx.userId), eq(notifications.read, false)),
      );
    return result.length;
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(notifications)
        .set({ read: true })
        .where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.userId)));
      return { success: true };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.userId, ctx.userId));
    return { success: true };
  }),

  // ── Comments ───────────────────────────────────────────────
  listComments: protectedProcedure
    .input(
      z.object({
        targetType: z.string(),
        targetId: z.string(),
        projectId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      return ctx.db.query.comments.findMany({
        where: and(
          eq(comments.targetType, input.targetType),
          eq(comments.targetId, input.targetId),
        ),
        orderBy: (c, { asc }) => [asc(c.createdAt)],
      });
    }),

  createComment: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        targetType: z.string(),
        targetId: z.string(),
        content: z.string().min(1),
        parentId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [comment] = await ctx.db
        .insert(comments)
        .values({ ...input, userId: ctx.userId })
        .returning();
      return comment;
    }),

  resolveComment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(comments)
        .set({ resolved: true, updatedAt: new Date() })
        .where(eq(comments.id, input.id))
        .returning();
      return updated;
    }),

  // ── Approvals ──────────────────────────────────────────────
  listApprovals: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      return ctx.db.query.approvals.findMany({
        where: eq(approvals.projectId, input.projectId),
        orderBy: (a, { desc }) => [desc(a.createdAt)],
      });
    }),

  requestApproval: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        targetType: z.string(),
        targetId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [approval] = await ctx.db
        .insert(approvals)
        .values({ ...input, requestedBy: ctx.userId })
        .returning();
      return approval;
    }),

  reviewApproval: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(['approved', 'rejected', 'revision_requested']),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updated] = await ctx.db
        .update(approvals)
        .set({ ...data, reviewedBy: ctx.userId, reviewedAt: new Date() })
        .where(eq(approvals.id, id))
        .returning();
      return updated;
    }),
});
