import { z } from 'zod';
import { rooms, projects, eq, and } from '@openlintel/db';
import { router, protectedProcedure } from '../init';

export const roomRouter = router({
  // List rooms for a project (verifies ownership)
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify project ownership
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      return ctx.db.query.rooms.findMany({
        where: eq(rooms.projectId, input.projectId),
        orderBy: (rooms, { asc }) => [asc(rooms.createdAt)],
      });
    }),

  // Get a single room
  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const room = await ctx.db.query.rooms.findFirst({
        where: eq(rooms.id, input.id),
        with: { project: true, designVariants: true },
      });
      if (!room || room.project.userId !== ctx.userId) throw new Error('Room not found');
      return room;
    }),

  // Create a room in a project
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1).max(200),
        type: z.string().default('other'),
        lengthMm: z.number().positive().optional(),
        widthMm: z.number().positive().optional(),
        heightMm: z.number().positive().optional(),
        floor: z.number().int().default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify project ownership
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      const [room] = await ctx.db.insert(rooms).values(input).returning();
      return room;
    }),

  // Update a room
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        type: z.string().optional(),
        lengthMm: z.number().positive().optional(),
        widthMm: z.number().positive().optional(),
        heightMm: z.number().positive().optional(),
        floor: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      // Verify ownership via project
      const room = await ctx.db.query.rooms.findFirst({
        where: eq(rooms.id, id),
        with: { project: true },
      });
      if (!room || room.project.userId !== ctx.userId) throw new Error('Room not found');

      const [updated] = await ctx.db
        .update(rooms)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(rooms.id, id))
        .returning();
      return updated;
    }),

  // Delete a room
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const room = await ctx.db.query.rooms.findFirst({
        where: eq(rooms.id, input.id),
        with: { project: true },
      });
      if (!room || room.project.userId !== ctx.userId) throw new Error('Room not found');

      await ctx.db.delete(rooms).where(eq(rooms.id, input.id));
      return { success: true };
    }),
});
