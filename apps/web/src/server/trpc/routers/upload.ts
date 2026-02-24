import { z } from 'zod';
import { uploads, projects, rooms, eq, and } from '@openlintel/db';
import { router, protectedProcedure } from '../init';
import { deleteFile } from '@/lib/storage';

export const uploadRouter = router({
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      return ctx.db.query.uploads.findMany({
        where: eq(uploads.projectId, input.projectId),
        orderBy: (uploads, { desc }) => [desc(uploads.createdAt)],
      });
    }),

  listByRoom: protectedProcedure
    .input(z.object({ roomId: z.string() }))
    .query(async ({ ctx, input }) => {
      const room = await ctx.db.query.rooms.findFirst({
        where: eq(rooms.id, input.roomId),
        with: { project: true },
      });
      if (!room || room.project.userId !== ctx.userId) throw new Error('Room not found');

      return ctx.db.query.uploads.findMany({
        where: eq(uploads.roomId, input.roomId),
        orderBy: (uploads, { desc }) => [desc(uploads.createdAt)],
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const upload = await ctx.db.query.uploads.findFirst({
        where: and(eq(uploads.id, input.id), eq(uploads.userId, ctx.userId)),
      });
      if (!upload) throw new Error('Upload not found');

      await deleteFile(upload.storageKey);
      if (upload.thumbnailKey) await deleteFile(upload.thumbnailKey);

      await ctx.db.delete(uploads).where(eq(uploads.id, input.id));
      return { success: true };
    }),
});
