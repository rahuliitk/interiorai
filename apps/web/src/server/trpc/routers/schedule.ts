import { z } from 'zod';
import {
  schedules, milestones, siteLogs, changeOrders, projects, jobs,
  eq, and,
} from '@openlintel/db';
import { router, protectedProcedure } from '../init';

const PROJECT_SERVICE_URL = process.env.PROJECT_SERVICE_URL || 'http://localhost:8007';

export const scheduleRouter = router({
  // ── Schedules ──────────────────────────────────────────────
  getByProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      return ctx.db.query.schedules.findMany({
        where: eq(schedules.projectId, input.projectId),
        with: { milestones: true },
        orderBy: (s, { desc }) => [desc(s.createdAt)],
      });
    }),

  generate: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      const [job] = await ctx.db
        .insert(jobs)
        .values({
          userId: ctx.userId,
          type: 'schedule_generation',
          status: 'pending',
          inputJson: { projectId: input.projectId },
          projectId: input.projectId,
        })
        .returning();

      fetch(`${PROJECT_SERVICE_URL}/api/v1/schedules/job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          project_id: input.projectId,
          user_id: ctx.userId,
        }),
      }).catch(() => {});

      return job;
    }),

  // ── Milestones ─────────────────────────────────────────────
  listMilestones: protectedProcedure
    .input(z.object({ scheduleId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.milestones.findMany({
        where: eq(milestones.scheduleId, input.scheduleId),
        orderBy: (m, { asc }) => [asc(m.dueDate)],
      });
    }),

  updateMilestone: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.string().optional(),
        completedDate: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updated] = await ctx.db
        .update(milestones)
        .set(data)
        .where(eq(milestones.id, id))
        .returning();
      return updated;
    }),

  // ── Site Logs ──────────────────────────────────────────────
  listSiteLogs: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      return ctx.db.query.siteLogs.findMany({
        where: eq(siteLogs.projectId, input.projectId),
        orderBy: (s, { desc }) => [desc(s.date)],
      });
    }),

  createSiteLog: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        date: z.date(),
        title: z.string().min(1),
        notes: z.string().optional(),
        weather: z.string().optional(),
        workersOnSite: z.number().int().optional(),
        photoKeys: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      const [log] = await ctx.db
        .insert(siteLogs)
        .values({ ...input, userId: ctx.userId })
        .returning();
      return log;
    }),

  // ── Change Orders ──────────────────────────────────────────
  listChangeOrders: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      return ctx.db.query.changeOrders.findMany({
        where: eq(changeOrders.projectId, input.projectId),
        orderBy: (c, { desc }) => [desc(c.createdAt)],
      });
    }),

  createChangeOrder: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        title: z.string().min(1),
        description: z.string().optional(),
        costImpact: z.number().optional(),
        timeImpactDays: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      const [order] = await ctx.db
        .insert(changeOrders)
        .values({ ...input, userId: ctx.userId })
        .returning();
      return order;
    }),

  updateChangeOrder: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.string().optional(),
        approvedBy: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const updates = data.status === 'approved'
        ? { ...data, approvedAt: new Date() }
        : data;
      const [updated] = await ctx.db
        .update(changeOrders)
        .set(updates)
        .where(eq(changeOrders.id, id))
        .returning();
      return updated;
    }),

  analyzeChangeOrderImpact: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.query.changeOrders.findFirst({
        where: eq(changeOrders.id, input.id),
        with: { project: true },
      });
      if (!order) throw new Error('Change order not found');
      if ((order as any).project.userId !== ctx.userId) throw new Error('Access denied');

      try {
        const res = await fetch(
          `${PROJECT_SERVICE_URL}/api/v1/change-orders/${input.id}/analyze`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              change_order_id: input.id,
              project_id: (order as any).projectId,
              title: order.title,
              description: order.description,
              cost_impact: order.costImpact,
              time_impact_days: order.timeImpactDays,
            }),
          },
        );
        if (!res.ok) throw new Error(`Analysis service returned ${res.status}`);
        return await res.json() as { summary: string; risks: string[]; recommendations: string[] };
      } catch {
        return {
          summary: `Change order "${order.title}" has a cost impact of $${order.costImpact ?? 0} and time impact of ${order.timeImpactDays ?? 0} days.`,
          risks: [],
          recommendations: [],
        };
      }
    }),
});
