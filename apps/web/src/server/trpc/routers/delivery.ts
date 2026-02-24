import { z } from 'zod';
import { router, protectedProcedure } from '../init';
import {
  deliveryTracking, projects, eq, and, desc,
} from '@openlintel/db';

export const deliveryRouter = router({
  // ── Create delivery ──────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      purchaseOrderId: z.string().optional(),
      vendorName: z.string().min(1),
      description: z.string().min(1),
      trackingNumber: z.string().optional(),
      estimatedDeliveryDate: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');
      const [delivery] = await ctx.db.insert(deliveryTracking).values({
        projectId: input.projectId,
        purchaseOrderId: input.purchaseOrderId ?? null,
        vendorName: input.vendorName,
        description: input.description,
        trackingNumber: input.trackingNumber ?? null,
        estimatedDeliveryDate: input.estimatedDeliveryDate ?? null,
      }).returning();
      return delivery;
    }),

  // ── List deliveries ──────────────────────────────────────
  list: protectedProcedure
    .input(z.object({ projectId: z.string(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');
      const conditions = [eq(deliveryTracking.projectId, input.projectId)];
      if (input.status) conditions.push(eq(deliveryTracking.status, input.status));
      return ctx.db.query.deliveryTracking.findMany({
        where: and(...conditions),
        orderBy: (d, { desc }) => [desc(d.createdAt)],
      });
    }),

  // ── Get single delivery ──────────────────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const delivery = await ctx.db.query.deliveryTracking.findFirst({
        where: eq(deliveryTracking.id, input.id),
        with: { project: true },
      });
      if (!delivery) throw new Error('Delivery not found');
      if ((delivery.project as any).userId !== ctx.userId) throw new Error('Access denied');
      return delivery;
    }),

  // ── Update delivery ──────────────────────────────────────
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(['pending', 'dispatched', 'in_transit', 'delivered', 'inspected', 'rejected']).optional(),
      trackingNumber: z.string().optional(),
      estimatedDeliveryDate: z.date().optional(),
      actualDeliveryDate: z.date().optional(),
      inspectionChecklist: z.array(z.object({ item: z.string(), passed: z.boolean(), note: z.string().optional() })).optional(),
      inspectionPhotoKeys: z.array(z.string()).optional(),
      receivedBy: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const delivery = await ctx.db.query.deliveryTracking.findFirst({
        where: eq(deliveryTracking.id, input.id),
        with: { project: true },
      });
      if (!delivery) throw new Error('Delivery not found');
      if ((delivery.project as any).userId !== ctx.userId) throw new Error('Access denied');
      const { id, ...data } = input;
      const updates: any = { ...data, updatedAt: new Date() };
      if (input.status === 'delivered') updates.actualDeliveryDate = updates.actualDeliveryDate ?? new Date();
      const [updated] = await ctx.db.update(deliveryTracking).set(updates).where(eq(deliveryTracking.id, id)).returning();
      return updated;
    }),

  // ── Delete delivery ──────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const delivery = await ctx.db.query.deliveryTracking.findFirst({
        where: eq(deliveryTracking.id, input.id),
        with: { project: true },
      });
      if (!delivery) throw new Error('Delivery not found');
      if ((delivery.project as any).userId !== ctx.userId) throw new Error('Access denied');
      await ctx.db.delete(deliveryTracking).where(eq(deliveryTracking.id, input.id));
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
      const deliveries = await ctx.db.query.deliveryTracking.findMany({
        where: eq(deliveryTracking.projectId, input.projectId),
      });
      const byStatus: Record<string, number> = {};
      deliveries.forEach((d) => { byStatus[d.status] = (byStatus[d.status] || 0) + 1; });
      const overdue = deliveries.filter((d) => 
        d.status !== 'delivered' && d.status !== 'inspected' && d.estimatedDeliveryDate && new Date(d.estimatedDeliveryDate) < new Date()
      );
      return { total: deliveries.length, byStatus, overdueCount: overdue.length, overdue };
    }),
});
