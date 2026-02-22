import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { projects } from '@openlintel/db';
import { router, protectedProcedure } from '../init';

export const projectRouter = router({
  // List all projects for the authenticated user
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.projects.findMany({
      where: eq(projects.userId, ctx.userId),
      orderBy: (projects, { desc }) => [desc(projects.updatedAt)],
      with: { rooms: true },
    });
  }),

  // Get a single project by ID
  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.id), eq(projects.userId, ctx.userId)),
        with: { rooms: true },
      });
      if (!project) throw new Error('Project not found');
      return project;
    }),

  // Create a new project
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        address: z.string().optional(),
        unitSystem: z.enum(['metric', 'imperial']).default('metric'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [project] = await ctx.db
        .insert(projects)
        .values({
          userId: ctx.userId,
          name: input.name,
          address: input.address,
          unitSystem: input.unitSystem,
        })
        .returning();
      return project;
    }),

  // Update a project
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        address: z.string().optional(),
        status: z.string().optional(),
        unitSystem: z.enum(['metric', 'imperial']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updated] = await ctx.db
        .update(projects)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(projects.id, id), eq(projects.userId, ctx.userId)))
        .returning();
      return updated;
    }),

  // Delete a project
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(projects)
        .where(and(eq(projects.id, input.id), eq(projects.userId, ctx.userId)));
      return { success: true };
    }),
});
