import { z } from 'zod';
import { projects, rooms, jobs, eq, and } from '@openlintel/db';
import { router, protectedProcedure } from '../init';

const VISION_ENGINE_URL = process.env.VISION_ENGINE_URL || 'http://localhost:8010';

export const reconstructionRouter = router({
  startReconstruction: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        roomId: z.string(),
        uploadIds: z.array(z.string()).min(1),
        referenceObject: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      const room = await ctx.db.query.rooms.findFirst({
        where: and(eq(rooms.id, input.roomId), eq(rooms.projectId, input.projectId)),
      });
      if (!room) throw new Error('Room not found');

      // Create a job for tracking
      const [job] = await ctx.db
        .insert(jobs)
        .values({
          userId: ctx.userId,
          type: 'reconstruction',
          status: 'pending',
          inputJson: {
            projectId: input.projectId,
            roomId: input.roomId,
            uploadIds: input.uploadIds,
            referenceObject: input.referenceObject,
          },
          projectId: input.projectId,
          roomId: input.roomId,
        })
        .returning();

      // Build image URLs from upload IDs
      const imageUrls = input.uploadIds.map(
        (id) => `${VISION_ENGINE_URL.replace('8010', '3000')}/api/uploads/${id}`,
      );

      // Fire-and-forget to vision engine
      fetch(`${VISION_ENGINE_URL}/api/v1/reconstruction/job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          user_id: ctx.userId,
          project_id: input.projectId,
          room_id: input.roomId,
          image_urls: imageUrls,
          reference_object: input.referenceObject ?? null,
        }),
      }).catch(() => {});

      return job;
    }),

  getResult: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ ctx, input }) => {
      const job = await ctx.db.query.jobs.findFirst({
        where: and(eq(jobs.id, input.jobId), eq(jobs.userId, ctx.userId)),
      });
      if (!job) throw new Error('Job not found');

      return {
        id: job.id,
        status: job.status,
        progress: (job as any).progress ?? 0,
        outputJson: (job as any).outputJson ?? null,
        error: (job as any).error ?? null,
        createdAt: job.createdAt,
      };
    }),

  listByRoom: protectedProcedure
    .input(z.object({ roomId: z.string() }))
    .query(async ({ ctx, input }) => {
      const room = await ctx.db.query.rooms.findFirst({
        where: eq(rooms.id, input.roomId),
        with: { project: true },
      });
      if (!room) throw new Error('Room not found');
      if (room.project.userId !== ctx.userId) throw new Error('Access denied');

      return ctx.db.query.jobs.findMany({
        where: and(
          eq(jobs.roomId, input.roomId),
          eq(jobs.type, 'reconstruction'),
          eq(jobs.userId, ctx.userId),
        ),
        orderBy: (j, { desc }) => [desc(j.createdAt)],
      });
    }),
});
