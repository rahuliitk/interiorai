import { z } from 'zod';
import { eq, and, ilike, sql } from 'drizzle-orm';
import {
  contractors, contractorReviews, contractorAssignments, projects,
} from '@openlintel/db';
import { router, protectedProcedure } from '../init';

export const contractorRouter = router({
  // ── List / Search Contractors ──────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        city: z.string().optional(),
        specialization: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.db
        .select()
        .from(contractors)
        .limit(input.limit)
        .offset(input.offset)
        .orderBy(sql`${contractors.rating} DESC NULLS LAST`);

      if (input.search) {
        query = query.where(ilike(contractors.name, `%${input.search}%`));
      }
      if (input.city) {
        query = query.where(eq(contractors.city, input.city));
      }

      return query;
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const contractor = await ctx.db.query.contractors.findFirst({
        where: eq(contractors.id, input.id),
        with: { reviews: true, assignments: true },
      });
      if (!contractor) throw new Error('Contractor not found');
      return contractor;
    }),

  // ── Reviews ────────────────────────────────────────────────
  listReviews: protectedProcedure
    .input(z.object({ contractorId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.contractorReviews.findMany({
        where: eq(contractorReviews.contractorId, input.contractorId),
        orderBy: (r, { desc }) => [desc(r.createdAt)],
      });
    }),

  createReview: protectedProcedure
    .input(
      z.object({
        contractorId: z.string(),
        projectId: z.string().optional(),
        rating: z.number().int().min(1).max(5),
        title: z.string().optional(),
        review: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [reviewRecord] = await ctx.db
        .insert(contractorReviews)
        .values({ ...input, userId: ctx.userId })
        .returning();

      // Update contractor aggregate rating
      const reviews = await ctx.db.query.contractorReviews.findMany({
        where: eq(contractorReviews.contractorId, input.contractorId),
      });
      const avgRating =
        reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

      await ctx.db
        .update(contractors)
        .set({
          rating: Math.round(avgRating * 10) / 10,
          totalReviews: reviews.length,
          updatedAt: new Date(),
        })
        .where(eq(contractors.id, input.contractorId));

      return reviewRecord;
    }),

  // ── Assignments ────────────────────────────────────────────
  assign: protectedProcedure
    .input(
      z.object({
        contractorId: z.string(),
        projectId: z.string(),
        role: z.string(),
        startDate: z.date().optional(),
        agreedAmount: z.number().optional(),
        currency: z.string().default('USD'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      const [assignment] = await ctx.db
        .insert(contractorAssignments)
        .values(input)
        .returning();
      return assignment;
    }),

  listAssignments: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      return ctx.db.query.contractorAssignments.findMany({
        where: eq(contractorAssignments.projectId, input.projectId),
        with: { contractor: true },
      });
    }),
});
