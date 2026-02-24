import { z } from 'zod';
import { mepCalculations, designVariants, projects, jobs, eq, and } from '@openlintel/db';
import { router, protectedProcedure } from '../init';

const MEP_SERVICE_URL = process.env.MEP_SERVICE_URL || 'http://localhost:8005';

export const mepRouter = router({
  listByDesignVariant: protectedProcedure
    .input(z.object({ designVariantId: z.string() }))
    .query(async ({ ctx, input }) => {
      const variant = await ctx.db.query.designVariants.findFirst({
        where: eq(designVariants.id, input.designVariantId),
        with: { room: { with: { project: true } } },
      });
      if (!variant || variant.room.project.userId !== ctx.userId) {
        throw new Error('Design variant not found');
      }

      return ctx.db.query.mepCalculations.findMany({
        where: eq(mepCalculations.designVariantId, input.designVariantId),
        orderBy: (m, { desc }) => [desc(m.createdAt)],
      });
    }),

  listByProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
        with: {
          rooms: {
            with: {
              designVariants: {
                with: { mepCalculations: true },
              },
            },
          },
        },
      });
      if (!project) throw new Error('Project not found');

      return project.rooms.flatMap((room) =>
        room.designVariants.flatMap((variant) =>
          variant.mepCalculations.map((calc) => ({
            ...calc,
            variantName: variant.name,
            roomName: room.name,
          })),
        ),
      );
    }),

  calculate: protectedProcedure
    .input(
      z.object({
        designVariantId: z.string(),
        calcType: z.enum(['electrical', 'plumbing', 'hvac']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const variant = await ctx.db.query.designVariants.findFirst({
        where: eq(designVariants.id, input.designVariantId),
        with: { room: { with: { project: true } } },
      });
      if (!variant || variant.room.project.userId !== ctx.userId) {
        throw new Error('Design variant not found');
      }

      const [job] = await ctx.db
        .insert(jobs)
        .values({
          userId: ctx.userId,
          type: `mep_${input.calcType}`,
          status: 'pending',
          inputJson: {
            designVariantId: input.designVariantId,
            calcType: input.calcType,
          },
          projectId: variant.room.project.id,
          roomId: variant.room.id,
          designVariantId: input.designVariantId,
        })
        .returning();

      fetch(`${MEP_SERVICE_URL}/api/v1/mep/job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          design_variant_id: input.designVariantId,
          user_id: ctx.userId,
          calc_type: input.calcType,
          room: {
            id: variant.room.id,
            type: variant.room.type,
            length_mm: variant.room.lengthMm ?? 0,
            width_mm: variant.room.widthMm ?? 0,
            height_mm: variant.room.heightMm ?? 2700,
          },
          style: variant.style,
          budget_tier: variant.budgetTier,
        }),
      }).catch(() => {});

      return job;
    }),

  jobStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ ctx, input }) => {
      const job = await ctx.db.query.jobs.findFirst({
        where: and(eq(jobs.id, input.jobId), eq(jobs.userId, ctx.userId)),
      });
      if (!job) throw new Error('Job not found');
      return job;
    }),
});
