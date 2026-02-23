import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { designVariants, rooms, projects } from '@openlintel/db';
import { router, protectedProcedure } from '../init';

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
});
