import { z } from 'zod';
import {
  portfolios, portfolioProjects, projects,
  eq, and, count, inArray,
} from '@openlintel/db';
import { router, protectedProcedure } from '../init';

export const portfolioRouter = router({
  // ── Create a new portfolio ─────────────────────────────────────────────────
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [portfolio] = await ctx.db
        .insert(portfolios)
        .values({
          userId: ctx.userId,
          name: input.name,
          description: input.description,
        })
        .returning();
      return portfolio;
    }),

  // ── List all portfolios for user with project counts ───────────────────────
  list: protectedProcedure.query(async ({ ctx }) => {
    const userPortfolios = await ctx.db.query.portfolios.findMany({
      where: eq(portfolios.userId, ctx.userId),
      orderBy: (p, { desc }) => [desc(p.updatedAt)],
    });

    if (userPortfolios.length === 0) return [];

    const portfolioIds = userPortfolios.map((p) => p.id);

    const projectCounts = await ctx.db
      .select({
        portfolioId: portfolioProjects.portfolioId,
        count: count(),
      })
      .from(portfolioProjects)
      .where(inArray(portfolioProjects.portfolioId, portfolioIds))
      .groupBy(portfolioProjects.portfolioId);

    const countMap = Object.fromEntries(
      projectCounts.map((r) => [r.portfolioId, Number(r.count)]),
    );

    return userPortfolios.map((p) => ({
      ...p,
      projectCount: countMap[p.id] ?? 0,
    }));
  }),

  // ── Get a single portfolio with its projects ───────────────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const portfolio = await ctx.db.query.portfolios.findFirst({
        where: and(eq(portfolios.id, input.id), eq(portfolios.userId, ctx.userId)),
        with: {
          portfolioProjects: {
            with: { project: { with: { rooms: true } } },
            orderBy: (pp, { asc }) => [asc(pp.sortOrder)],
          },
        },
      });
      if (!portfolio) throw new Error('Portfolio not found');
      return portfolio;
    }),

  // ── Update a portfolio ─────────────────────────────────────────────────────
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updated] = await ctx.db
        .update(portfolios)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(portfolios.id, id), eq(portfolios.userId, ctx.userId)))
        .returning();
      if (!updated) throw new Error('Portfolio not found');
      return updated;
    }),

  // ── Delete a portfolio ─────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.portfolios.findFirst({
        where: and(eq(portfolios.id, input.id), eq(portfolios.userId, ctx.userId)),
      });
      if (!existing) throw new Error('Portfolio not found');

      await ctx.db
        .delete(portfolios)
        .where(and(eq(portfolios.id, input.id), eq(portfolios.userId, ctx.userId)));
      return { success: true };
    }),

  // ── Add a project to a portfolio ───────────────────────────────────────────
  addProject: protectedProcedure
    .input(
      z.object({
        portfolioId: z.string(),
        projectId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify portfolio ownership
      const portfolio = await ctx.db.query.portfolios.findFirst({
        where: and(eq(portfolios.id, input.portfolioId), eq(portfolios.userId, ctx.userId)),
      });
      if (!portfolio) throw new Error('Portfolio not found');

      // Verify project ownership
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      // Determine next sortOrder
      const existing = await ctx.db
        .select({ maxSort: count() })
        .from(portfolioProjects)
        .where(eq(portfolioProjects.portfolioId, input.portfolioId));
      const nextSort = Number(existing[0]?.maxSort) || 0;

      const [entry] = await ctx.db
        .insert(portfolioProjects)
        .values({
          portfolioId: input.portfolioId,
          projectId: input.projectId,
          sortOrder: nextSort,
        })
        .returning();

      // Touch portfolio updatedAt
      await ctx.db
        .update(portfolios)
        .set({ updatedAt: new Date() })
        .where(eq(portfolios.id, input.portfolioId));

      return entry;
    }),

  // ── Remove a project from a portfolio ──────────────────────────────────────
  removeProject: protectedProcedure
    .input(
      z.object({
        portfolioId: z.string(),
        projectId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify portfolio ownership
      const portfolio = await ctx.db.query.portfolios.findFirst({
        where: and(eq(portfolios.id, input.portfolioId), eq(portfolios.userId, ctx.userId)),
      });
      if (!portfolio) throw new Error('Portfolio not found');

      await ctx.db
        .delete(portfolioProjects)
        .where(
          and(
            eq(portfolioProjects.portfolioId, input.portfolioId),
            eq(portfolioProjects.projectId, input.projectId),
          ),
        );

      // Touch portfolio updatedAt
      await ctx.db
        .update(portfolios)
        .set({ updatedAt: new Date() })
        .where(eq(portfolios.id, input.portfolioId));

      return { success: true };
    }),

  // ── Dashboard stats for a portfolio ────────────────────────────────────────
  dashboardStats: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify portfolio ownership
      const portfolio = await ctx.db.query.portfolios.findFirst({
        where: and(eq(portfolios.id, input.id), eq(portfolios.userId, ctx.userId)),
        with: {
          portfolioProjects: {
            with: {
              project: {
                with: {
                  rooms: {
                    with: {
                      designVariants: {
                        with: { bomResults: true },
                      },
                    },
                  },
                  schedules: {
                    with: { milestones: true },
                  },
                },
              },
            },
          },
        },
      });
      if (!portfolio) throw new Error('Portfolio not found');

      const projectEntries = portfolio.portfolioProjects;
      const projectCount = projectEntries.length;

      let totalBudget = 0;
      let roomCount = 0;
      let totalCompletion = 0;
      let projectsWithMilestones = 0;

      for (const pp of projectEntries) {
        const proj = pp.project;

        // Count rooms
        roomCount += proj.rooms.length;

        // Sum total cost from BOM results across all rooms -> variants -> bomResults
        for (const room of proj.rooms) {
          for (const variant of room.designVariants) {
            for (const bom of variant.bomResults) {
              totalBudget += bom.totalCost ?? 0;
            }
          }
        }

        // Calculate completion % from milestones
        const schedule = proj.schedules[0];
        if (schedule && schedule.milestones.length > 0) {
          const totalMs = schedule.milestones.length;
          const completedMs = schedule.milestones.filter(
            (m: any) => m.status === 'completed',
          ).length;
          totalCompletion += (completedMs / totalMs) * 100;
          projectsWithMilestones += 1;
        }
      }

      const averageCompletion =
        projectsWithMilestones > 0
          ? Math.round(totalCompletion / projectsWithMilestones)
          : 0;

      return {
        totalBudget,
        averageCompletion,
        projectCount,
        roomCount,
      };
    }),

  // ── Bulk order opportunities across portfolio projects ─────────────────────
  bulkOrderOpportunities: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify portfolio ownership and load full BOM data
      const portfolio = await ctx.db.query.portfolios.findFirst({
        where: and(eq(portfolios.id, input.id), eq(portfolios.userId, ctx.userId)),
        with: {
          portfolioProjects: {
            with: {
              project: {
                with: {
                  rooms: {
                    with: {
                      designVariants: {
                        with: { bomResults: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!portfolio) throw new Error('Portfolio not found');

      // Aggregate materials across all projects
      // BOM items are stored as jsonb arrays in bomResults.items
      // Each item has: { name/material, quantity, unit, unitPrice, total, category }
      const materialMap = new Map<
        string,
        { totalQuantity: number; projectIds: Set<string>; totalCost: number }
      >();

      for (const pp of portfolio.portfolioProjects) {
        const projectId = pp.project.id;
        for (const room of pp.project.rooms) {
          for (const variant of room.designVariants) {
            for (const bom of variant.bomResults) {
              const items = (bom.items as Array<{
                name?: string;
                material?: string;
                quantity?: number;
                total?: number;
                unitPrice?: number;
                category?: string;
              }>) || [];

              for (const item of items) {
                const materialName = item.name || item.material || 'Unknown';
                const existing = materialMap.get(materialName);
                if (existing) {
                  existing.totalQuantity += item.quantity ?? 0;
                  existing.projectIds.add(projectId);
                  existing.totalCost += item.total ?? 0;
                } else {
                  materialMap.set(materialName, {
                    totalQuantity: item.quantity ?? 0,
                    projectIds: new Set([projectId]),
                    totalCost: item.total ?? 0,
                  });
                }
              }
            }
          }
        }
      }

      // Only consider materials that appear in 2+ projects (bulk opportunity)
      const BULK_DISCOUNT_RATE = 0.12; // estimated 12% savings for bulk ordering

      const opportunities = Array.from(materialMap.entries())
        .filter(([, data]) => data.projectIds.size >= 2)
        .map(([material, data]) => ({
          material,
          totalQuantity: data.totalQuantity,
          projectCount: data.projectIds.size,
          estimatedSavings: Math.round(data.totalCost * BULK_DISCOUNT_RATE * 100) / 100,
        }))
        .sort((a, b) => b.estimatedSavings - a.estimatedSavings);

      return opportunities;
    }),
});
