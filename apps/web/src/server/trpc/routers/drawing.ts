import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { drawingResults, designVariants, rooms, projects, jobs } from '@openlintel/db';
import { router, protectedProcedure } from '../init';

const DRAWING_SERVICE_URL = process.env.DRAWING_SERVICE_URL || 'http://localhost:8003';

export const drawingRouter = router({
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

      return ctx.db.query.drawingResults.findMany({
        where: eq(drawingResults.designVariantId, input.designVariantId),
        orderBy: (d, { desc }) => [desc(d.createdAt)],
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
                with: { drawingResults: true },
              },
            },
          },
        },
      });
      if (!project) throw new Error('Project not found');

      return project.rooms.flatMap((room) =>
        room.designVariants.flatMap((variant) =>
          variant.drawingResults.map((drawing) => ({
            ...drawing,
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
        drawingTypes: z.array(z.string()).default([
          'floor_plan', 'furnished_plan', 'elevation', 'electrical_layout',
        ]),
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
          type: 'drawing_generation',
          status: 'pending',
          inputJson: {
            designVariantId: input.designVariantId,
            drawingTypes: input.drawingTypes,
          },
          projectId: variant.room.project.id,
          roomId: variant.room.id,
          designVariantId: input.designVariantId,
        })
        .returning();

      fetch(`${DRAWING_SERVICE_URL}/api/v1/drawings/job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          design_variant_id: input.designVariantId,
          user_id: ctx.userId,
          drawing_types: input.drawingTypes,
          room: {
            id: variant.room.id,
            type: variant.room.type,
            length_mm: variant.room.lengthMm ?? 0,
            width_mm: variant.room.widthMm ?? 0,
            height_mm: variant.room.heightMm ?? 2700,
          },
        }),
      }).catch(() => {});

      return job;
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const drawing = await ctx.db.query.drawingResults.findFirst({
        where: eq(drawingResults.id, input.id),
        with: { designVariant: { with: { room: { with: { project: true } } } } },
      });
      if (!drawing || drawing.designVariant.room.project.userId !== ctx.userId) {
        throw new Error('Drawing not found');
      }
      return drawing;
    }),
});
