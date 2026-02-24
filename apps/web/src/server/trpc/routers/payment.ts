import { z } from 'zod';
import { payments, invoices, purchaseOrders, projects, eq, and } from '@openlintel/db';
import { router, protectedProcedure } from '../init';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
});

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

  // ── Stripe Checkout ──────────────────────────────────────────
  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        paymentId: z.string(),
        projectId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      const payment = await ctx.db.query.payments.findFirst({
        where: and(eq(payments.id, input.paymentId), eq(payments.projectId, input.projectId)),
      });
      if (!payment) throw new Error('Payment not found');

      const origin = process.env.NEXTAUTH_URL || 'http://localhost:3000';
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: (payment.currency || 'usd').toLowerCase(),
              product_data: {
                name: `Payment for ${project.name}`,
                description: `Payment #${payment.id.slice(0, 8)}`,
              },
              unit_amount: Math.round((Number(payment.amount) || 0) * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        metadata: {
          payment_id: payment.id,
          project_id: input.projectId,
        },
        success_url: `${origin}/project/${input.projectId}/payments?payment_status=success`,
        cancel_url: `${origin}/project/${input.projectId}/payments?payment_status=cancelled`,
      });

      // Update payment status to processing
      await ctx.db
        .update(payments)
        .set({ status: 'processing', paymentProvider: 'stripe', externalId: session.id })
        .where(eq(payments.id, input.paymentId));

      return { checkoutUrl: session.url };
    }),

  getPaymentStatus: protectedProcedure
    .input(z.object({ paymentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const payment = await ctx.db.query.payments.findFirst({
        where: eq(payments.id, input.paymentId),
        with: { project: true },
      });
      if (!payment) throw new Error('Payment not found');
      if ((payment.project as any).userId !== ctx.userId) throw new Error('Access denied');

      // If payment has a Stripe session ID, check its status
      if (payment.externalId && payment.paymentProvider === 'stripe') {
        try {
          const session = await stripe.checkout.sessions.retrieve(payment.externalId);
          return {
            id: payment.id,
            status: payment.status,
            stripeStatus: session.payment_status,
            amount: payment.amount,
            currency: payment.currency,
          };
        } catch {
          // Stripe lookup failed — return DB status
        }
      }

      return {
        id: payment.id,
        status: payment.status,
        stripeStatus: null,
        amount: payment.amount,
        currency: payment.currency,
      };
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
