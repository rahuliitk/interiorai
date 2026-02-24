import { z } from 'zod';
import { router, protectedProcedure } from '../init';
import {
  maintenanceSchedules,
  maintenanceLogs,
  projects,
  eq,
  and,
  desc,
  sum,
  count,
  gte,
  lte,
} from '@openlintel/db';
import { TRPCError } from '@trpc/server';

const categoryEnum = z.enum([
  'hvac',
  'plumbing',
  'electrical',
  'structural',
  'appliance',
  'exterior',
]);

const statusEnum = z.enum(['active', 'paused', 'completed']);

/** Verify that the project exists and belongs to the current user. */
async function verifyProjectOwnership(
  db: any,
  projectId: string,
  userId: string,
) {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
  });
  if (!project) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Project not found',
    });
  }
  return project;
}

export const maintenanceRouter = router({
  // ── 1. Create a maintenance schedule ─────────────────────────
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        itemName: z.string().min(1),
        category: categoryEnum,
        frequencyDays: z.number().int().positive(),
        nextDueAt: z.date(),
        provider: z.string().optional(),
        estimatedCost: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwnership(ctx.db, input.projectId, ctx.userId);

      const [schedule] = await ctx.db
        .insert(maintenanceSchedules)
        .values(input)
        .returning();

      return schedule;
    }),

  // ── 2. List schedules with latest log ────────────────────────
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwnership(ctx.db, input.projectId, ctx.userId);

      const schedules = await ctx.db.query.maintenanceSchedules.findMany({
        where: eq(maintenanceSchedules.projectId, input.projectId),
        orderBy: (s, { asc }) => [asc(s.nextDueAt)],
      });

      // Attach the latest log for each schedule
      const schedulesWithLatestLog = await Promise.all(
        schedules.map(async (schedule) => {
          const [latestLog] = await ctx.db
            .select()
            .from(maintenanceLogs)
            .where(eq(maintenanceLogs.scheduleId, schedule.id))
            .orderBy(desc(maintenanceLogs.performedAt))
            .limit(1);

          return { ...schedule, latestLog: latestLog ?? null };
        }),
      );

      return schedulesWithLatestLog;
    }),

  // ── 3. Get a single schedule with all logs ───────────────────
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const schedule = await ctx.db.query.maintenanceSchedules.findFirst({
        where: eq(maintenanceSchedules.id, input.id),
      });

      if (!schedule) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Maintenance schedule not found',
        });
      }

      await verifyProjectOwnership(ctx.db, schedule.projectId, ctx.userId);

      const logs = await ctx.db
        .select()
        .from(maintenanceLogs)
        .where(eq(maintenanceLogs.scheduleId, schedule.id))
        .orderBy(desc(maintenanceLogs.performedAt));

      return { ...schedule, logs };
    }),

  // ── 4. Update a maintenance schedule ─────────────────────────
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        itemName: z.string().min(1).optional(),
        category: categoryEnum.optional(),
        frequencyDays: z.number().int().positive().optional(),
        nextDueAt: z.date().optional(),
        provider: z.string().optional(),
        estimatedCost: z.number().optional(),
        status: statusEnum.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.maintenanceSchedules.findFirst({
        where: eq(maintenanceSchedules.id, input.id),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Maintenance schedule not found',
        });
      }

      await verifyProjectOwnership(ctx.db, existing.projectId, ctx.userId);

      const { id, ...data } = input;

      const [updated] = await ctx.db
        .update(maintenanceSchedules)
        .set(data)
        .where(eq(maintenanceSchedules.id, id))
        .returning();

      return updated;
    }),

  // ── 5. Delete a maintenance schedule ─────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.maintenanceSchedules.findFirst({
        where: eq(maintenanceSchedules.id, input.id),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Maintenance schedule not found',
        });
      }

      await verifyProjectOwnership(ctx.db, existing.projectId, ctx.userId);

      await ctx.db
        .delete(maintenanceSchedules)
        .where(eq(maintenanceSchedules.id, input.id));

      return { success: true };
    }),

  // ── 6. Log a completed maintenance event ─────────────────────
  logCompletion: protectedProcedure
    .input(
      z.object({
        scheduleId: z.string(),
        performedBy: z.string().optional(),
        cost: z.number().optional(),
        notes: z.string().optional(),
        photoKeys: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const schedule = await ctx.db.query.maintenanceSchedules.findFirst({
        where: eq(maintenanceSchedules.id, input.scheduleId),
      });

      if (!schedule) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Maintenance schedule not found',
        });
      }

      await verifyProjectOwnership(ctx.db, schedule.projectId, ctx.userId);

      // Create the maintenance log
      const [log] = await ctx.db
        .insert(maintenanceLogs)
        .values({
          scheduleId: input.scheduleId,
          performedAt: new Date(),
          performedBy: input.performedBy,
          cost: input.cost,
          notes: input.notes,
          photoKeys: input.photoKeys,
        })
        .returning();

      // Auto-calculate and update the next due date
      const nextDueAt = new Date();
      nextDueAt.setDate(nextDueAt.getDate() + schedule.frequencyDays);

      await ctx.db
        .update(maintenanceSchedules)
        .set({ nextDueAt })
        .where(eq(maintenanceSchedules.id, input.scheduleId));

      return { log, nextDueAt };
    }),

  // ── 7. Get upcoming schedules within N days ──────────────────
  getUpcoming: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        daysAhead: z.number().int().positive().default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      await verifyProjectOwnership(ctx.db, input.projectId, ctx.userId);

      const now = new Date();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + input.daysAhead);

      const upcoming = await ctx.db
        .select()
        .from(maintenanceSchedules)
        .where(
          and(
            eq(maintenanceSchedules.projectId, input.projectId),
            eq(maintenanceSchedules.status, 'active'),
            gte(maintenanceSchedules.nextDueAt, now),
            lte(maintenanceSchedules.nextDueAt, cutoff),
          ),
        )
        .orderBy(maintenanceSchedules.nextDueAt);

      return upcoming;
    }),

  // ── 8. Dashboard aggregates ──────────────────────────────────
  getDashboard: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwnership(ctx.db, input.projectId, ctx.userId);

      const now = new Date();
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      // Overdue count: active schedules where nextDueAt < now
      const [overdueResult] = await ctx.db
        .select({ value: count() })
        .from(maintenanceSchedules)
        .where(
          and(
            eq(maintenanceSchedules.projectId, input.projectId),
            eq(maintenanceSchedules.status, 'active'),
            lte(maintenanceSchedules.nextDueAt, now),
          ),
        );

      // Upcoming count: active schedules due within 7 days (but not overdue)
      const [upcomingResult] = await ctx.db
        .select({ value: count() })
        .from(maintenanceSchedules)
        .where(
          and(
            eq(maintenanceSchedules.projectId, input.projectId),
            eq(maintenanceSchedules.status, 'active'),
            gte(maintenanceSchedules.nextDueAt, now),
            lte(maintenanceSchedules.nextDueAt, sevenDaysFromNow),
          ),
        );

      // Total spent: sum of all maintenance log costs for this project's schedules
      const [totalSpentResult] = await ctx.db
        .select({ value: sum(maintenanceLogs.cost) })
        .from(maintenanceLogs)
        .innerJoin(
          maintenanceSchedules,
          eq(maintenanceLogs.scheduleId, maintenanceSchedules.id),
        )
        .where(eq(maintenanceSchedules.projectId, input.projectId));

      // Active schedule count
      const [activeResult] = await ctx.db
        .select({ value: count() })
        .from(maintenanceSchedules)
        .where(
          and(
            eq(maintenanceSchedules.projectId, input.projectId),
            eq(maintenanceSchedules.status, 'active'),
          ),
        );

      return {
        overdueCount: overdueResult?.value ?? 0,
        upcomingCount: upcomingResult?.value ?? 0,
        totalSpent: Number(totalSpentResult?.value ?? 0),
        activeScheduleCount: activeResult?.value ?? 0,
      };
    }),
});
