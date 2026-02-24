import { z } from 'zod';
import { router, protectedProcedure } from '../init';
import {
  vendors, purchaseOrders, projects,
  eq, and, desc, count,
} from '@openlintel/db';

export const vendorManagementRouter = router({
  // ── List vendors with order stats ────────────────────────
  listVendors: protectedProcedure
    .input(z.object({ projectId: z.string().optional() }))
    .query(async ({ ctx }) => {
      const allVendors = await ctx.db.query.vendors.findMany({
        orderBy: (v, { asc }) => [asc(v.name)],
      });
      return allVendors;
    }),

  // ── Get vendor detail with orders ────────────────────────
  getVendor: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const vendor = await ctx.db.query.vendors.findFirst({
        where: eq(vendors.id, input.id),
        with: { products: true, purchaseOrders: true },
      });
      if (!vendor) throw new Error('Vendor not found');
      return vendor;
    }),

  // ── List orders for a vendor within a project ────────────
  listVendorOrders: protectedProcedure
    .input(z.object({ projectId: z.string(), vendorId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');
      const conditions = [eq(purchaseOrders.projectId, input.projectId)];
      if (input.vendorId) conditions.push(eq(purchaseOrders.vendorId, input.vendorId));
      return ctx.db.query.purchaseOrders.findMany({
        where: and(...conditions),
        orderBy: (o, { desc }) => [desc(o.createdAt)],
      });
    }),

  // ── Vendor performance summary ───────────────────────────
  vendorPerformance: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');
      const orders = await ctx.db.query.purchaseOrders.findMany({
        where: eq(purchaseOrders.projectId, input.projectId),
        with: { vendor: true },
      });
      const vendorStats: Record<string, { name: string; totalOrders: number; delivered: number; pending: number; totalAmount: number }> = {};
      orders.forEach((o) => {
        const vid = o.vendorId ?? 'unknown';
        const vname = (o.vendor as any)?.name ?? 'Unknown';
        if (!vendorStats[vid]) vendorStats[vid] = { name: vname, totalOrders: 0, delivered: 0, pending: 0, totalAmount: 0 };
        vendorStats[vid].totalOrders++;
        if (o.status === 'delivered') vendorStats[vid].delivered++;
        else vendorStats[vid].pending++;
        vendorStats[vid].totalAmount += (o as any).totalAmount ?? 0;
      });
      return Object.entries(vendorStats).map(([id, stats]) => ({ id, ...stats }));
    }),

  // ── Create vendor (simplified) ───────────────────────────
  createVendor: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().optional(),
      address: z.string().optional(),
      website: z.string().optional(),
      rating: z.number().min(0).max(5).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [vendor] = await ctx.db.insert(vendors).values({
        name: input.name,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        address: input.address ?? null,
        website: input.website ?? null,
        rating: input.rating ?? null,
      }).returning();
      return vendor;
    }),

  // ── Update vendor ────────────────────────────────────────
  updateVendor: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().optional(),
      contactEmail: z.string().optional(),
      contactPhone: z.string().optional(),
      address: z.string().optional(),
      website: z.string().optional(),
      rating: z.number().min(0).max(5).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updated] = await ctx.db.update(vendors).set(data).where(eq(vendors.id, id)).returning();
      return updated;
    }),
});
