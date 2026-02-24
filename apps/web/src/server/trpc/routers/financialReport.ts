import { z } from 'zod';
import { router, protectedProcedure } from '../init';
import {
  projects, payments, purchaseOrders, invoices,
  eq, and, sum, desc,
} from '@openlintel/db';

export const financialReportRouter = router({
  // ── Budget vs Actuals ────────────────────────────────────
  budgetVsActuals: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      const allPayments = await ctx.db.query.payments.findMany({
        where: eq(payments.projectId, input.projectId),
      });
      const allOrders = await ctx.db.query.purchaseOrders.findMany({
        where: eq(purchaseOrders.projectId, input.projectId),
      });

      const totalPaid = allPayments
        .filter((p) => p.status === 'paid')
        .reduce((sum, p) => sum + (p.amount ?? 0), 0);
      const totalPending = allPayments
        .filter((p) => p.status === 'pending')
        .reduce((sum, p) => sum + (p.amount ?? 0), 0);
      const totalOrdered = allOrders
        .reduce((sum, o) => sum + ((o as any).totalAmount ?? 0), 0);
      const estimatedBudget = (project as any).estimatedBudget ?? 0;

      return {
        estimatedBudget,
        totalPaid,
        totalPending,
        totalOrdered,
        variance: estimatedBudget - totalPaid - totalPending,
        paymentCount: allPayments.length,
        orderCount: allOrders.length,
      };
    }),

  // ── Expenditure Timeline ─────────────────────────────────
  expenditureTimeline: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      const allPayments = await ctx.db.query.payments.findMany({
        where: and(eq(payments.projectId, input.projectId), eq(payments.status, 'paid')),
        orderBy: (p, { asc }) => [asc(p.createdAt)],
      });

      // Group by month
      const monthly: Record<string, number> = {};
      let cumulative = 0;
      const timeline: { month: string; amount: number; cumulative: number }[] = [];

      allPayments.forEach((p) => {
        const date = new Date(p.createdAt);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthly[key] = (monthly[key] || 0) + (p.amount ?? 0);
      });

      Object.entries(monthly)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([month, amount]) => {
          cumulative += amount;
          timeline.push({ month, amount, cumulative });
        });

      return timeline;
    }),

  // ── Category-wise Spend ──────────────────────────────────
  categorySpend: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      const allPayments = await ctx.db.query.payments.findMany({
        where: and(eq(payments.projectId, input.projectId), eq(payments.status, 'paid')),
      });

      const byCategory: Record<string, number> = {};
      allPayments.forEach((p) => {
        const cat = (p as any).category ?? 'Uncategorized';
        byCategory[cat] = (byCategory[cat] || 0) + (p.amount ?? 0);
      });

      return Object.entries(byCategory).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
    }),

  // ── Invoice List ─────────────────────────────────────────
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

  // ── Per-Square-Foot Cost ─────────────────────────────────
  perSqftCost: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      const allPayments = await ctx.db.query.payments.findMany({
        where: and(eq(payments.projectId, input.projectId), eq(payments.status, 'paid')),
      });
      const totalSpent = allPayments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
      const sqft = (project as any).totalAreaSqft ?? 0;

      return {
        totalSpent,
        totalAreaSqft: sqft,
        costPerSqft: sqft > 0 ? Math.round(totalSpent / sqft) : 0,
        marketBenchmark: { economy: 800, midRange: 1500, premium: 2500, luxury: 4000 },
      };
    }),
});
