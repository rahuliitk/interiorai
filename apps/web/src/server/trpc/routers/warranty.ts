import { z } from 'zod';
import { router, protectedProcedure } from '../init';
import {
  warranties, warrantyClaims, projects,
  eq, and, gte, lte, count,
} from '@openlintel/db';

export const warrantyRouter = router({
  // ── Create warranty ─────────────────────────────────────────
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        itemName: z.string().min(1),
        category: z.enum(['appliance', 'fixture', 'material', 'system']),
        brand: z.string().optional(),
        serialNumber: z.string().optional(),
        warrantyStartDate: z.date(),
        warrantyEndDate: z.date(),
        warrantyType: z.enum(['manufacturer', 'extended', 'contractor']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      const [warranty] = await ctx.db
        .insert(warranties)
        .values({
          projectId: input.projectId,
          itemName: input.itemName,
          category: input.category,
          brand: input.brand ?? null,
          serialNumber: input.serialNumber ?? null,
          warrantyStartDate: input.warrantyStartDate,
          warrantyEndDate: input.warrantyEndDate,
          warrantyType: input.warrantyType ?? 'manufacturer',
        })
        .returning();
      return warranty;
    }),

  // ── List warranties for a project (with claim count) ───────
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      const rows = await ctx.db
        .select({
          warranty: warranties,
          claimCount: count(warrantyClaims.id),
        })
        .from(warranties)
        .leftJoin(warrantyClaims, eq(warrantyClaims.warrantyId, warranties.id))
        .where(eq(warranties.projectId, input.projectId))
        .groupBy(warranties.id)
        .orderBy(warranties.warrantyEndDate);

      return rows.map((r) => ({
        ...r.warranty,
        claimCount: Number(r.claimCount),
      }));
    }),

  // ── Get single warranty with all claims ────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const warranty = await ctx.db.query.warranties.findFirst({
        where: eq(warranties.id, input.id),
        with: { project: true, claims: true },
      });
      if (!warranty) throw new Error('Warranty not found');
      if ((warranty.project as any).userId !== ctx.userId) throw new Error('Access denied');

      return warranty;
    }),

  // ── Update warranty ─────────────────────────────────────────
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        itemName: z.string().min(1).optional(),
        category: z.enum(['appliance', 'fixture', 'material', 'system']).optional(),
        brand: z.string().optional(),
        serialNumber: z.string().optional(),
        warrantyEndDate: z.date().optional(),
        warrantyType: z.enum(['manufacturer', 'extended', 'contractor']).optional(),
        status: z.enum(['active', 'expired', 'claimed']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const warranty = await ctx.db.query.warranties.findFirst({
        where: eq(warranties.id, input.id),
        with: { project: true },
      });
      if (!warranty) throw new Error('Warranty not found');
      if ((warranty.project as any).userId !== ctx.userId) throw new Error('Access denied');

      const { id, ...data } = input;
      const [updated] = await ctx.db
        .update(warranties)
        .set(data)
        .where(eq(warranties.id, id))
        .returning();
      return updated;
    }),

  // ── Delete warranty ─────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const warranty = await ctx.db.query.warranties.findFirst({
        where: eq(warranties.id, input.id),
        with: { project: true },
      });
      if (!warranty) throw new Error('Warranty not found');
      if ((warranty.project as any).userId !== ctx.userId) throw new Error('Access denied');

      await ctx.db.delete(warranties).where(eq(warranties.id, input.id));
      return { success: true };
    }),

  // ── File a claim against a warranty ─────────────────────────
  fileClaim: protectedProcedure
    .input(
      z.object({
        warrantyId: z.string(),
        issueDescription: z.string().min(1),
        photoKeys: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const warranty = await ctx.db.query.warranties.findFirst({
        where: eq(warranties.id, input.warrantyId),
        with: { project: true },
      });
      if (!warranty) throw new Error('Warranty not found');
      if ((warranty.project as any).userId !== ctx.userId) throw new Error('Access denied');

      const [claim] = await ctx.db
        .insert(warrantyClaims)
        .values({
          warrantyId: input.warrantyId,
          issueDescription: input.issueDescription,
          photoKeys: input.photoKeys ?? null,
          status: 'filed',
        })
        .returning();

      // Update warranty status to 'claimed'
      await ctx.db
        .update(warranties)
        .set({ status: 'claimed' })
        .where(eq(warranties.id, input.warrantyId));

      return claim;
    }),

  // ── Update claim status ─────────────────────────────────────
  updateClaim: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(['filed', 'in_review', 'approved', 'denied', 'resolved']),
        resolutionDate: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const claim = await ctx.db.query.warrantyClaims.findFirst({
        where: eq(warrantyClaims.id, input.id),
        with: { warranty: { with: { project: true } } },
      });
      if (!claim) throw new Error('Claim not found');
      if ((claim.warranty as any).project.userId !== ctx.userId) throw new Error('Access denied');

      const [updated] = await ctx.db
        .update(warrantyClaims)
        .set({
          status: input.status,
          resolutionDate: input.resolutionDate ?? null,
        })
        .where(eq(warrantyClaims.id, input.id))
        .returning();
      return updated;
    }),

  // ── Get warranties expiring within N days (bucketed) ───────
  getExpiringAlerts: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        daysAhead: z.number().int().positive().optional().default(90),
      }),
    )
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      const now = new Date();
      const cutoff = new Date(now.getTime() + input.daysAhead * 24 * 60 * 60 * 1000);

      const expiring = await ctx.db.query.warranties.findMany({
        where: and(
          eq(warranties.projectId, input.projectId),
          eq(warranties.status, 'active'),
          gte(warranties.warrantyEndDate, now),
          lte(warranties.warrantyEndDate, cutoff),
        ),
        orderBy: (w, { asc }) => [asc(w.warrantyEndDate)],
      });

      const day30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const day60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      const day90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

      const within30 = expiring.filter((w) => w.warrantyEndDate <= day30);
      const within60 = expiring.filter((w) => w.warrantyEndDate > day30 && w.warrantyEndDate <= day60);
      const within90 = expiring.filter((w) => w.warrantyEndDate > day60 && w.warrantyEndDate <= day90);

      return {
        total: expiring.length,
        buckets: {
          within30days: within30,
          within60days: within60,
          within90days: within90,
        },
        all: expiring,
      };
    }),
});
