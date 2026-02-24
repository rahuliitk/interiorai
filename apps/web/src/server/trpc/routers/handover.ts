import { z } from 'zod';
import { router, protectedProcedure } from '../init';
import {
  handoverPackages, projects, warranties, contractors, contractorAssignments,
  eq, and,
} from '@openlintel/db';

export const handoverRouter = router({
  // ── Create or get handover package ───────────────────────
  getOrCreate: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');
      const existing = await ctx.db.query.handoverPackages.findFirst({
        where: eq(handoverPackages.projectId, input.projectId),
      });
      if (existing) return existing;
      const [pkg] = await ctx.db.insert(handoverPackages).values({
        projectId: input.projectId,
        status: 'draft',
      }).returning();
      return pkg;
    }),

  // ── Get handover package ─────────────────────────────────
  get: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');
      return ctx.db.query.handoverPackages.findFirst({
        where: eq(handoverPackages.projectId, input.projectId),
      }) ?? null;
    }),

  // ── Update handover package ──────────────────────────────
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(['draft', 'in_progress', 'ready', 'delivered']).optional(),
      asBuiltDrawingKeys: z.array(z.string()).optional(),
      materialRegister: z.array(z.object({
        item: z.string(), brand: z.string(), model: z.string(),
        batch: z.string().optional(), purchaseDate: z.string().optional(), vendor: z.string().optional(),
      })).optional(),
      contractorDirectory: z.array(z.object({
        name: z.string(), trade: z.string(), phone: z.string().optional(), email: z.string().optional(),
      })).optional(),
      operationalGuides: z.array(z.object({
        system: z.string(), instructions: z.string(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const pkg = await ctx.db.query.handoverPackages.findFirst({
        where: eq(handoverPackages.id, input.id),
        with: { project: true },
      });
      if (!pkg) throw new Error('Package not found');
      if ((pkg.project as any).userId !== ctx.userId) throw new Error('Access denied');
      const { id, ...data } = input;
      const updates: any = { ...data, updatedAt: new Date() };
      if (input.status === 'delivered') updates.deliveredAt = new Date();
      const [updated] = await ctx.db.update(handoverPackages).set(updates).where(eq(handoverPackages.id, id)).returning();
      return updated;
    }),

  // ── Sign off (client signature) ──────────────────────────
  signOff: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const pkg = await ctx.db.query.handoverPackages.findFirst({
        where: eq(handoverPackages.id, input.id),
        with: { project: true },
      });
      if (!pkg) throw new Error('Package not found');
      if ((pkg.project as any).userId !== ctx.userId) throw new Error('Access denied');
      const [updated] = await ctx.db.update(handoverPackages).set({
        clientSignedAt: new Date(),
        status: 'delivered',
        deliveredAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(handoverPackages.id, input.id)).returning();
      return updated;
    }),

  // ── Gather project summary data for handover ─────────────
  gatherData: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');
      const projectWarranties = await ctx.db.query.warranties.findMany({
        where: eq(warranties.projectId, input.projectId),
      });
      const assignments = await ctx.db.query.contractorAssignments.findMany({
        where: eq(contractorAssignments.projectId, input.projectId),
      });
      return {
        project,
        warrantiesCount: projectWarranties.length,
        contractorsAssigned: assignments.length,
      };
    }),
});
