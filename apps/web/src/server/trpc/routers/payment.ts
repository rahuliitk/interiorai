import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { payments, invoices, purchaseOrders, projects, vendors } from '@openlintel/db';
import { router, protectedProcedure } from '../init';

export const paymentRouter = router({
  // ── Payments ───────────────────────────────────────────────
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      return ctx.db.query.payments.findMany({
        where: eq(payments.projectId, input.projectId),
        with: { milestone: true },
        orderBy: (p, { desc }) => [desc(p.createdAt)],
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        milestoneId: z.string().optional(),
        amount: z.number().positive(),
        currency: z.string().default('USD'),
        paymentProvider: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      const [payment] = await ctx.db.insert(payments).values(input).returning();
      return payment;
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.string(),
        externalId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const updates = data.status === 'completed'
        ? { ...data, paidAt: new Date() }
        : data;
      const [updated] = await ctx.db
        .update(payments)
        .set(updates)
        .where(eq(payments.id, id))
        .returning();
      return updated;
    }),

  // ── Purchase Orders ────────────────────────────────────────
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

  createOrder: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        vendorId: z.string().optional(),
        items: z.array(
          z.object({
            productId: z.string(),
            quantity: z.number().positive(),
            unitPrice: z.number().positive(),
          }),
        ),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      const totalAmount = input.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0,
      );

      const [order] = await ctx.db
        .insert(purchaseOrders)
        .values({ ...input, totalAmount })
        .returning();
      return order;
    }),

  updateOrderStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, status } = input;
      const updates =
        status === 'delivered'
          ? { status, actualDelivery: new Date(), updatedAt: new Date() }
          : { status, updatedAt: new Date() };
      const [updated] = await ctx.db
        .update(purchaseOrders)
        .set(updates)
        .where(eq(purchaseOrders.id, id))
        .returning();
      return updated;
    }),

  // ── Invoices ───────────────────────────────────────────────
  listInvoices: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      return ctx.db.query.invoices.findMany({
        where: eq(invoices.projectId, input.projectId),
        orderBy: (i, { desc }) => [desc(i.createdAt)],
      });
    }),
});
