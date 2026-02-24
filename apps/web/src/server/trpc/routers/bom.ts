import { z } from 'zod';
import { bomResults, designVariants, projects, jobs, eq, and } from '@openlintel/db';
import { router, protectedProcedure } from '../init';

const BOM_SERVICE_URL = process.env.BOM_SERVICE_URL || 'http://localhost:8002';

export const bomRouter = router({
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

      return ctx.db.query.bomResults.findMany({
        where: eq(bomResults.designVariantId, input.designVariantId),
        orderBy: (b, { desc }) => [desc(b.createdAt)],
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
                with: { bomResults: true },
              },
            },
          },
        },
      });
      if (!project) throw new Error('Project not found');

      return project.rooms.flatMap((room) =>
        room.designVariants.flatMap((variant) =>
          variant.bomResults.map((bom) => ({
            ...bom,
            variantName: variant.name,
            roomName: room.name,
          })),
        ),
      );
    }),

  generate: protectedProcedure
    .input(
      z.object({
        designVariantId: z.string(),
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

      // Create job
      const [job] = await ctx.db
        .insert(jobs)
        .values({
          userId: ctx.userId,
          type: 'bom_calculation',
          status: 'pending',
          inputJson: { designVariantId: input.designVariantId },
          projectId: variant.room.project.id,
          roomId: variant.room.id,
          designVariantId: input.designVariantId,
        })
        .returning();

      // Trigger BOM service (fire-and-forget)
      fetch(`${BOM_SERVICE_URL}/api/v1/bom/job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          design_variant_id: input.designVariantId,
          user_id: ctx.userId,
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
      }).catch(() => {
        // Service may be down; job stays pending
      });

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

  exportUrl: protectedProcedure
    .input(z.object({ bomResultId: z.string(), format: z.enum(['xlsx', 'pdf']) }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const bom = await ctx.db.query.bomResults.findFirst({
        where: eq(bomResults.id, input.bomResultId),
        with: { designVariant: { with: { room: { with: { project: true } } } } },
      });
      if (!bom || (bom.designVariant as any).room.project.userId !== ctx.userId) {
        throw new Error('BOM result not found');
      }
      return { url: `/api/bom/export/${input.bomResultId}?format=${input.format}` };
    }),
});
