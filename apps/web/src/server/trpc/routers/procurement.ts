import { z } from 'zod';
import {
  purchaseOrders, projects, jobs, bomResults, vendors,
  schedules, eq, and,
} from '@openlintel/db';
import { router, protectedProcedure } from '../init';

const PROCUREMENT_SERVICE_URL = process.env.PROCUREMENT_SERVICE_URL || 'http://localhost:8008';

export const procurementRouter = router({
  generateOrders: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      bomResultId: z.string(),
      targetBudget: z.number().optional(),
      currency: z.string().default('INR'),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      // Load BOM items from DB with ownership verification
      const bomResult = await ctx.db.query.bomResults.findFirst({
        where: eq(bomResults.id, input.bomResultId),
        with: {
          designVariant: { with: { room: { with: { project: true } } } },
        },
      });
      if (!bomResult) throw new Error('BOM result not found');
      const bomProject = (bomResult.designVariant as any)?.room?.project;
      if (!bomProject || bomProject.userId !== ctx.userId) {
        throw new Error('Access denied');
      }

      const bomItems = (bomResult.items as any[]).map((item) => ({
        name: item.name,
        category: item.category,
        specification: item.specification || '',
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unitPrice,
      }));

      // Load vendors from DB for the service
      const vendorList = await ctx.db.query.vendors.findMany({
        where: eq(vendors.isActive, true),
      });
      const vendorPayload = vendorList.map((v) => ({
        id: v.id,
        name: v.name,
        categories: v.metadata && typeof v.metadata === 'object'
          ? ((v.metadata as any).categories || [])
          : [],
        lead_time_days: v.metadata && typeof v.metadata === 'object'
          ? ((v.metadata as any).lead_time_days || 7)
          : 7,
        min_order_qty: 1,
        min_order_value: 0,
        shipping_cost: 0,
        rating: v.rating || 3.0,
        city: v.city || '',
      }));

      // Load schedule milestones if available
      const schedule = await ctx.db.query.schedules.findFirst({
        where: eq(schedules.projectId, input.projectId),
        with: { milestones: true },
      });
      const scheduleMilestones = schedule?.milestones?.map((m) => ({
        name: m.name,
        date: m.dueDate?.toISOString().split('T')[0],
      })) || [];

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

      // Fire-and-forget to procurement service with full payload
      fetch(`${PROCUREMENT_SERVICE_URL}/api/v1/orders/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          project_id: input.projectId,
          user_id: ctx.userId,
          bom_items: bomItems,
          vendors: vendorPayload.length > 0 ? vendorPayload : undefined,
          schedule_milestones: scheduleMilestones.length > 0 ? scheduleMilestones : undefined,
          target_budget: input.targetBudget,
          currency: input.currency,
        }),
      }).catch(() => {});

      return job;
    }),

  // Poll job and persist results when complete
  syncOrderResults: protectedProcedure
    .input(z.object({ jobId: z.string(), projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.query.jobs.findFirst({
        where: and(eq(jobs.id, input.jobId), eq(jobs.userId, ctx.userId)),
      });
      if (!job) throw new Error('Job not found');
      if (job.status !== 'completed') return { synced: false, status: job.status };

      // Check if orders already persisted
      const existing = await ctx.db.query.purchaseOrders.findMany({
        where: eq(purchaseOrders.projectId, input.projectId),
      });

      const output = job.outputJson as any;
      if (!output?.orders?.length) return { synced: false, status: 'no_orders' };

      // Only persist if we don't already have orders from this job
      const jobOrderIds = new Set((output.orders as any[]).map((o: any) => o.id));
      const alreadyPersisted = existing.some((e) => jobOrderIds.has(e.id));
      if (alreadyPersisted) return { synced: true, status: 'already_persisted' };

      // Persist purchase orders to DB
      for (const order of output.orders as any[]) {
        // Find or skip vendor matching
        const vendorMatch = order.vendor_id
          ? await ctx.db.query.vendors.findFirst({ where: eq(vendors.id, order.vendor_id) })
          : null;

        await ctx.db.insert(purchaseOrders).values({
          projectId: input.projectId,
          vendorId: vendorMatch?.id || null,
          status: 'draft',
          items: order.items || [],
          totalAmount: order.total || order.subtotal || 0,
          currency: order.currency || 'INR',
          expectedDelivery: order.expected_delivery ? new Date(order.expected_delivery) : null,
          notes: order.phase ? `Phase: ${order.phase}` : null,
        });
      }

      return { synced: true, status: 'persisted', count: (output.orders as any[]).length };
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

  updateOrderStatus: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(['draft', 'submitted', 'confirmed', 'shipped', 'delivered', 'cancelled']),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.query.purchaseOrders.findFirst({
        where: eq(purchaseOrders.id, input.id),
        with: { project: true },
      });
      if (!order) throw new Error('Order not found');
      if ((order.project as any).userId !== ctx.userId) throw new Error('Access denied');

      const [updated] = await ctx.db
        .update(purchaseOrders)
        .set({
          status: input.status,
          notes: input.notes || order.notes,
          actualDelivery: input.status === 'delivered' ? new Date() : order.actualDelivery,
          updatedAt: new Date(),
        })
        .where(eq(purchaseOrders.id, input.id))
        .returning();
      return updated;
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
