import { z } from 'zod';
import {
  projects, rooms, designVariants, bomResults,
  eq, and, sql, count, sum,
} from '@openlintel/db';
import { router, protectedProcedure } from '../init';

export const analyticsRouter = router({
  globalOverview: protectedProcedure.query(async ({ ctx }) => {
    // Total spending: sum of bom_results.total_cost for user's projects
    const spendingResult = await ctx.db
      .select({ total: sum(bomResults.totalCost) })
      .from(bomResults)
      .innerJoin(designVariants, eq(bomResults.designVariantId, designVariants.id))
      .innerJoin(rooms, eq(designVariants.roomId, rooms.id))
      .innerJoin(projects, eq(rooms.projectId, projects.id))
      .where(eq(projects.userId, ctx.userId));
    const totalSpent = Number(spendingResult[0]?.total) || 0;

    // Style distribution
    const styleRows = await ctx.db
      .select({ style: designVariants.style, count: count() })
      .from(designVariants)
      .innerJoin(rooms, eq(designVariants.roomId, rooms.id))
      .innerJoin(projects, eq(rooms.projectId, projects.id))
      .where(eq(projects.userId, ctx.userId))
      .groupBy(designVariants.style)
      .orderBy(sql`count(*) desc`);

    // Budget tier distribution
    const budgetRows = await ctx.db
      .select({ tier: designVariants.budgetTier, count: count() })
      .from(designVariants)
      .innerJoin(rooms, eq(designVariants.roomId, rooms.id))
      .innerJoin(projects, eq(rooms.projectId, projects.id))
      .where(eq(projects.userId, ctx.userId))
      .groupBy(designVariants.budgetTier);

    // Spending trend: last 6 months from bomResults.createdAt
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const trendRows = await ctx.db
      .select({
        month: sql<string>`TO_CHAR(${bomResults.createdAt}, 'Mon')`,
        monthNum: sql<number>`EXTRACT(MONTH FROM ${bomResults.createdAt})`,
        amount: sum(bomResults.totalCost),
      })
      .from(bomResults)
      .innerJoin(designVariants, eq(bomResults.designVariantId, designVariants.id))
      .innerJoin(rooms, eq(designVariants.roomId, rooms.id))
      .innerJoin(projects, eq(rooms.projectId, projects.id))
      .where(and(
        eq(projects.userId, ctx.userId),
        sql`${bomResults.createdAt} >= ${sixMonthsAgo}`,
      ))
      .groupBy(sql`TO_CHAR(${bomResults.createdAt}, 'Mon')`, sql`EXTRACT(MONTH FROM ${bomResults.createdAt})`)
      .orderBy(sql`EXTRACT(MONTH FROM ${bomResults.createdAt})`);

    // Project counts by status
    const statusRows = await ctx.db
      .select({ status: projects.status, count: count() })
      .from(projects)
      .where(eq(projects.userId, ctx.userId))
      .groupBy(projects.status);

    // Total project and room counts
    const userProjects = await ctx.db.query.projects.findMany({
      where: eq(projects.userId, ctx.userId),
      with: { rooms: true },
    });
    const totalProjects = userProjects.length;
    const totalRooms = userProjects.reduce((s, p) => s + (p.rooms?.length ?? 0), 0);
    const activeProjects = userProjects.filter(p => p.status !== 'completed').length;
    const completedProjects = userProjects.filter(p => p.status === 'completed').length;

    return {
      totalSpent,
      totalProjects,
      totalRooms,
      activeProjects,
      completedProjects,
      styleDistribution: styleRows.map(r => ({ name: r.style, count: Number(r.count) })),
      budgetDistribution: budgetRows.map(r => ({ label: r.tier, value: Number(r.count) })),
      spendingTrend: trendRows.map(r => ({ month: r.month, amount: Number(r.amount) || 0 })),
      statusCounts: Object.fromEntries(statusRows.map(r => [r.status, Number(r.count)])),
    };
  }),

  projectOverview: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
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
      });
      if (!project) throw new Error('Project not found');

      // Cost breakdown by BOM item category
      const categoryTotals: Record<string, number> = {};
      project.rooms.forEach(room => {
        room.designVariants.forEach(variant => {
          variant.bomResults.forEach(bom => {
            const items = (bom.items as Array<{ category: string; total: number }>) || [];
            items.forEach(item => {
              categoryTotals[item.category] = (categoryTotals[item.category] || 0) + (item.total || 0);
            });
          });
        });
      });
      const categoryColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#a855f7', '#ef4444'];
      const costBreakdown = Object.entries(categoryTotals)
        .sort((a, b) => b[1] - a[1])
        .map(([name, amount], i) => ({
          name,
          amount,
          color: categoryColors[i % categoryColors.length],
        }));

      // Milestones from schedule
      const schedule = project.schedules[0];
      const milestonesData = (schedule?.milestones || []).map((ms: any) => ({
        id: ms.id,
        name: ms.name,
        date: ms.dueDate ? new Date(ms.dueDate).toISOString() : new Date().toISOString(),
        completed: ms.status === 'completed',
      }));

      // Completion percent
      const totalMilestones = milestonesData.length;
      const completedMilestones = milestonesData.filter((m: any) => m.completed).length;
      const completionPercent = totalMilestones > 0
        ? Math.round((completedMilestones / totalMilestones) * 100)
        : 0;

      // Budget vs actual
      const budgetItems = costBreakdown.map(cat => ({
        name: cat.name,
        budgeted: Math.round(cat.amount * 1.1), // estimated budget is 10% over actual
        actual: cat.amount,
      }));

      const totalCost = costBreakdown.reduce((s, c) => s + c.amount, 0);

      return {
        totalCost,
        costBreakdown,
        milestones: milestonesData,
        completionPercent,
        budgetItems,
        startDate: schedule?.startDate ? new Date(schedule.startDate).toISOString() : null,
        endDate: schedule?.endDate ? new Date(schedule.endDate).toISOString() : null,
        roomCount: project.rooms.length,
        variantCount: project.rooms.reduce((s, r) => s + r.designVariants.length, 0),
      };
    }),

  categorySpend: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
        with: {
          rooms: {
            with: {
              designVariants: {
                with: { bomResults: true },
              },
            },
          },
        },
      });
      if (!project) throw new Error('Project not found');

      const categoryMap: Record<string, { totalCost: number; itemCount: number }> = {};
      project.rooms.forEach(room => {
        room.designVariants.forEach(variant => {
          variant.bomResults.forEach(bom => {
            const items = (bom.items as Array<{ category: string; total: number; quantity: number }>) || [];
            items.forEach(item => {
              if (!categoryMap[item.category]) {
                categoryMap[item.category] = { totalCost: 0, itemCount: 0 };
              }
              categoryMap[item.category].totalCost += item.total || 0;
              categoryMap[item.category].itemCount += item.quantity || 1;
            });
          });
        });
      });

      return Object.entries(categoryMap)
        .map(([category, data]) => ({ category, ...data }))
        .sort((a, b) => b.totalCost - a.totalCost);
    }),

  perSqftBenchmark: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
        with: {
          rooms: {
            with: {
              designVariants: {
                with: { bomResults: true },
              },
            },
          },
        },
      });
      if (!project) throw new Error('Project not found');

      return project.rooms.map(room => {
        const areaSqft = room.lengthMm && room.widthMm
          ? (room.lengthMm * room.widthMm) / (304.8 * 304.8)
          : 0;
        let totalCost = 0;
        room.designVariants.forEach(variant => {
          variant.bomResults.forEach(bom => {
            totalCost += bom.totalCost || 0;
          });
        });
        return {
          roomId: room.id,
          roomName: room.name,
          roomType: room.type,
          areaSqft: Math.round(areaSqft * 100) / 100,
          totalCost,
          costPerSqft: areaSqft > 0 ? Math.round((totalCost / areaSqft) * 100) / 100 : 0,
        };
      });
    }),

  exportReport: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
        with: {
          rooms: {
            with: {
              designVariants: {
                with: { bomResults: true },
              },
            },
          },
        },
      });
      if (!project) throw new Error('Project not found');

      const rows: string[] = ['Category,Item,Quantity,Unit Price,Total,Room'];
      project.rooms.forEach(room => {
        room.designVariants.forEach(variant => {
          variant.bomResults.forEach(bom => {
            const items = (bom.items as Array<{
              category: string; name: string; quantity: number; unitPrice: number; total: number;
            }>) || [];
            items.forEach(item => {
              rows.push(
                `"${item.category}","${item.name}",${item.quantity},${item.unitPrice},${item.total},"${room.name}"`,
              );
            });
          });
        });
      });

      return { csv: rows.join('\n'), filename: `${project.name}-report.csv` };
    }),
});
