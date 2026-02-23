import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { projects, jobs, uploads } from '@openlintel/db';
import { router, protectedProcedure } from '../init';

const VISION_SERVICE_URL = process.env.VISION_SERVICE_URL || 'http://localhost:8011';

export const floorPlanRouter = router({
  digitize: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        uploadId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify project ownership
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      // Verify upload exists and belongs to user
      const upload = await ctx.db.query.uploads.findFirst({
        where: and(eq(uploads.id, input.uploadId), eq(uploads.userId, ctx.userId)),
      });
      if (!upload) throw new Error('Upload not found');

      // Create job
      const [job] = await ctx.db
        .insert(jobs)
        .values({
          userId: ctx.userId,
          type: 'floor_plan_digitization',
          status: 'pending',
          inputJson: {
            projectId: input.projectId,
            uploadId: input.uploadId,
            storageKey: upload.storageKey,
          },
          projectId: input.projectId,
        })
        .returning();

      // Build image URL (internal presigned URL or direct storage URL)
      const imageUrl = `/api/uploads/${encodeURIComponent(upload.storageKey)}`;
      const origin = process.env.NEXTAUTH_URL || 'http://localhost:3000';
      const fullImageUrl = `${origin}${imageUrl}`;

      // Fire-and-forget to vision-engine
      fetch(`${VISION_SERVICE_URL}/api/v1/vision/job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          user_id: ctx.userId,
          project_id: input.projectId,
          image_url: fullImageUrl,
          upload_id: input.uploadId,
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
});
