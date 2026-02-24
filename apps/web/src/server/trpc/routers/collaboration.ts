import { z } from 'zod';
import { router, protectedProcedure } from '../init';
import {
  collaborationThreads, collaborationMessages, projects, eq, and, desc, count,
} from '@openlintel/db';

export const collaborationRouter = router({
  // ── Create thread ────────────────────────────────────────
  createThread: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      roomId: z.string().optional(),
      title: z.string().min(1),
      category: z.enum(['general', 'design_decision', 'issue', 'change_request', 'approval']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');
      const [thread] = await ctx.db.insert(collaborationThreads).values({
        projectId: input.projectId,
        roomId: input.roomId ?? null,
        title: input.title,
        category: input.category ?? 'general',
        createdBy: ctx.userId,
      }).returning();
      return thread;
    }),

  // ── List threads ─────────────────────────────────────────
  listThreads: protectedProcedure
    .input(z.object({ projectId: z.string(), category: z.string().optional(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');
      const conditions = [eq(collaborationThreads.projectId, input.projectId)];
      if (input.category) conditions.push(eq(collaborationThreads.category, input.category));
      if (input.status) conditions.push(eq(collaborationThreads.status, input.status));
      
      const threads = await ctx.db
        .select({
          thread: collaborationThreads,
          messageCount: count(collaborationMessages.id),
        })
        .from(collaborationThreads)
        .leftJoin(collaborationMessages, eq(collaborationMessages.threadId, collaborationThreads.id))
        .where(and(...conditions))
        .groupBy(collaborationThreads.id)
        .orderBy(desc(collaborationThreads.updatedAt));
      
      return threads.map((r) => ({ ...r.thread, messageCount: Number(r.messageCount) }));
    }),

  // ── Get thread with messages ─────────────────────────────
  getThread: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const thread = await ctx.db.query.collaborationThreads.findFirst({
        where: eq(collaborationThreads.id, input.id),
        with: { project: true, messages: true },
      });
      if (!thread) throw new Error('Thread not found');
      if ((thread.project as any).userId !== ctx.userId) throw new Error('Access denied');
      return thread;
    }),

  // ── Update thread status ─────────────────────────────────
  updateThread: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(['open', 'resolved', 'archived']).optional(),
      title: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const thread = await ctx.db.query.collaborationThreads.findFirst({
        where: eq(collaborationThreads.id, input.id),
        with: { project: true },
      });
      if (!thread) throw new Error('Thread not found');
      if ((thread.project as any).userId !== ctx.userId) throw new Error('Access denied');
      const { id, ...data } = input;
      const [updated] = await ctx.db.update(collaborationThreads).set({ ...data, updatedAt: new Date() }).where(eq(collaborationThreads.id, id)).returning();
      return updated;
    }),

  // ── Delete thread ────────────────────────────────────────
  deleteThread: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const thread = await ctx.db.query.collaborationThreads.findFirst({
        where: eq(collaborationThreads.id, input.id),
        with: { project: true },
      });
      if (!thread) throw new Error('Thread not found');
      if ((thread.project as any).userId !== ctx.userId) throw new Error('Access denied');
      await ctx.db.delete(collaborationThreads).where(eq(collaborationThreads.id, input.id));
      return { success: true };
    }),

  // ── Post message ─────────────────────────────────────────
  postMessage: protectedProcedure
    .input(z.object({
      threadId: z.string(),
      content: z.string().min(1),
      mentions: z.array(z.string()).optional(),
      attachmentKeys: z.array(z.string()).optional(),
      isDecision: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const thread = await ctx.db.query.collaborationThreads.findFirst({
        where: eq(collaborationThreads.id, input.threadId),
        with: { project: true },
      });
      if (!thread) throw new Error('Thread not found');
      if ((thread.project as any).userId !== ctx.userId) throw new Error('Access denied');
      const [message] = await ctx.db.insert(collaborationMessages).values({
        threadId: input.threadId,
        userId: ctx.userId,
        content: input.content,
        mentions: input.mentions ?? null,
        attachmentKeys: input.attachmentKeys ?? null,
        isDecision: input.isDecision ?? false,
      }).returning();
      // Update thread's updatedAt
      await ctx.db.update(collaborationThreads).set({ updatedAt: new Date() }).where(eq(collaborationThreads.id, input.threadId));
      return message;
    }),

  // ── List decisions (messages marked as decisions) ────────
  listDecisions: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');
      const threads = await ctx.db.query.collaborationThreads.findMany({
        where: eq(collaborationThreads.projectId, input.projectId),
      });
      const threadIds = threads.map((t) => t.id);
      if (threadIds.length === 0) return [];
      const decisions = await ctx.db.query.collaborationMessages.findMany({
        where: and(
          eq(collaborationMessages.isDecision, true),
        ),
        orderBy: (m, { desc }) => [desc(m.createdAt)],
      });
      // Filter to only messages belonging to this project's threads
      return decisions.filter((d) => threadIds.includes(d.threadId));
    }),
});
