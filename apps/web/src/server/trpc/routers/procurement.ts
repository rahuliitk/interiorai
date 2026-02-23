import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { purchaseOrders, projects, jobs } from '@openlintel/db';
import { router, protectedProcedure } from '../init';

const PROCUREMENT_SERVICE_URL = process.env.PROCUREMENT_SERVICE_URL || 'http://localhost:8008';

export const procurementRouter = router({
  generateOrders: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      bomResultId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      // Create job
      const [job] = await ctx.db
        .insert(jobs)
        .values({
          userId: ctx.userId,
          type: 'procurement_generation',
          status: 'pending',
          inputJson: { projectId: input.projectId, bomResultId: input.bomResultId },
          projectId: input.projectId,
        })
        .returning();

      // Fire-and-forget to procurement service
      fetch(`${PROCUREMENT_SERVICE_URL}/api/v1/orders/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          project_id: input.projectId,
          bom_result_id: input.bomResultId,
          user_id: ctx.userId,
        }),
      }).catch(() => {});

      return job;
    }),

  listOrders: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      return ctx.db.query.purchaseOrders.findMany({
        where: eq(purchaseOrders.projectId, input.projectId),
        with: { vendor: true },
        orderBy: (p, { desc }) => [desc(p.createdAt)],
      });
    }),

  getOrder: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.query.purchaseOrders.findFirst({
        where: eq(purchaseOrders.id, input.id),
        with: { vendor: true, project: true },
      });
      if (!order) throw new Error('Order not found');
      if ((order.project as any).userId !== ctx.userId) throw new Error('Access denied');
      return order;
    }),

  trackDelivery: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ input }) => {
      try {
        const res = await fetch(`${PROCUREMENT_SERVICE_URL}/api/v1/delivery/${input.orderId}`);
        if (!res.ok) return { status: 'unknown', tracking: null };
        return res.json();
      } catch {
        return { status: 'unknown', tracking: null };
      }
    }),

  jobStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ ctx, input }) => {
      const job = await ctx.db.query.jobs.findFirst({
        where: and(eq(jobs.id, input.jobId), eq(jobs.userId, ctx.userId)),
      });
      if (!job) throw new Error('Job not found');
      return job;
    }),
});
