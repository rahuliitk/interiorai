import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { designVariants, rooms, projects, jobs } from '@openlintel/db';
import { router, protectedProcedure } from '../init';

const DESIGN_SERVICE_URL = process.env.DESIGN_SERVICE_URL || 'http://localhost:8001';

export const designVariantRouter = router({
  listByRoom: protectedProcedure
    .input(z.object({ roomId: z.string() }))
    .query(async ({ ctx, input }) => {
      const room = await ctx.db.query.rooms.findFirst({
        where: eq(rooms.id, input.roomId),
        with: { project: true },
      });
      if (!room || room.project.userId !== ctx.userId) throw new Error('Room not found');

      return ctx.db.query.designVariants.findMany({
        where: eq(designVariants.roomId, input.roomId),
        orderBy: (dv, { desc }) => [desc(dv.createdAt)],
      });
    }),

  listByProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
        with: { rooms: { with: { designVariants: true } } },
      });
      if (!project) throw new Error('Project not found');

      // Flatten all variants across rooms, attaching room info
      return project.rooms.flatMap((room) =>
        room.designVariants.map((variant) => ({
          ...variant,
          roomName: room.name,
          roomId: room.id,
        })),
      );
    }),

  create: protectedProcedure
    .input(
      z.object({
        roomId: z.string(),
        name: z.string().min(1).max(200),
        style: z.string().min(1),
        budgetTier: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const room = await ctx.db.query.rooms.findFirst({
        where: eq(rooms.id, input.roomId),
        with: { project: true },
      });
      if (!room || room.project.userId !== ctx.userId) throw new Error('Room not found');

      const [variant] = await ctx.db.insert(designVariants).values(input).returning();
      return variant;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        style: z.string().optional(),
        budgetTier: z.string().optional(),
        renderUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const variant = await ctx.db.query.designVariants.findFirst({
        where: eq(designVariants.id, id),
        with: { room: { with: { project: true } } },
      });
      if (!variant || variant.room.project.userId !== ctx.userId) {
        throw new Error('Design variant not found');
      }

      const [updated] = await ctx.db
        .update(designVariants)
        .set(data)
        .where(eq(designVariants.id, id))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const variant = await ctx.db.query.designVariants.findFirst({
        where: eq(designVariants.id, input.id),
        with: { room: { with: { project: true } } },
      });
      if (!variant || variant.room.project.userId !== ctx.userId) {
        throw new Error('Design variant not found');
      }

      await ctx.db.delete(designVariants).where(eq(designVariants.id, input.id));
      return { success: true };
    }),

  generate: protectedProcedure
    .input(
      z.object({
        designVariantId: z.string(),
        style: z.string().min(1),
        budgetTier: z.string().min(1),
        constraints: z.array(z.string()).optional(),
        additionalPrompt: z.string().optional(),
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

      // Update variant with generation parameters
      await ctx.db
        .update(designVariants)
        .set({
          style: input.style,
          budgetTier: input.budgetTier,
          constraints: input.constraints ?? [],
        })
        .where(eq(designVariants.id, input.designVariantId));

      // Create job
      const [job] = await ctx.db
        .insert(jobs)
        .values({
          userId: ctx.userId,
          type: 'design_generation',
          status: 'pending',
          inputJson: {
            designVariantId: input.designVariantId,
            style: input.style,
            budgetTier: input.budgetTier,
            constraints: input.constraints,
            additionalPrompt: input.additionalPrompt,
          },
          projectId: variant.room.project.id,
          roomId: variant.room.id,
          designVariantId: input.designVariantId,
        })
        .returning();

      // Update variant with job reference
      await ctx.db
        .update(designVariants)
        .set({ jobId: job.id })
        .where(eq(designVariants.id, input.designVariantId));

      // Trigger design-engine service (fire-and-forget)
      fetch(`${DESIGN_SERVICE_URL}/api/v1/designs/job`, {
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
          style: input.style,
          budget_tier: input.budgetTier,
          constraints: input.constraints ?? [],
          additional_prompt: input.additionalPrompt,
        }),
      }).catch(() => {
        // Service may be down; job stays pending
      });

      return job;
    }),
});
