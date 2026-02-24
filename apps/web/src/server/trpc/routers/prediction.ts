import { z } from 'zod';
import {
  costPredictions,
  timelinePredictions,
  projects,
  eq,
  and,
  desc,
} from '@openlintel/db';
import { router, protectedProcedure } from '../init';
import { callLLM } from '@/lib/llm-client';

export const predictionRouter = router({
  // ── Cost Prediction ──────────────────────────────────────────
  predictCost: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership and gather project data
      const project = await ctx.db.query.projects.findFirst({
        where: and(
          eq(projects.id, input.projectId),
          eq(projects.userId, ctx.userId),
        ),
        with: {
          rooms: {
            with: {
              designVariants: {
                with: { bomResults: true },
              },
            },
          },
          schedules: true,
        },
      });
      if (!project) throw new Error('Project not found');

      // Build the input snapshot from project data
      const inputSnapshot = {
        projectId: project.id,
        projectName: project.name,
        status: project.status,
        rooms: project.rooms.map((room) => ({
          id: room.id,
          name: room.name,
          type: room.type,
          lengthMm: room.lengthMm,
          widthMm: room.widthMm,
          heightMm: room.heightMm,
          designVariants: room.designVariants.map((variant) => ({
            id: variant.id,
            name: variant.name,
            style: variant.style,
            budgetTier: variant.budgetTier,
            bomResults: variant.bomResults.map((bom) => ({
              id: bom.id,
              totalCost: bom.totalCost,
              items: bom.items,
            })),
          })),
        })),
        schedules: project.schedules.map((sched) => ({
          id: sched.id,
          startDate: sched.startDate,
          endDate: sched.endDate,
        })),
      };

      const systemPrompt = `You are a construction cost estimation AI. You analyze project data including rooms, design variants, bill-of-materials results, and schedules to predict total project cost with confidence intervals. Always respond with valid JSON matching this schema:
{
  "predictedCost": <number>,
  "confidenceLow": <number>,
  "confidenceHigh": <number>,
  "riskFactors": [{ "name": <string>, "impact": <number>, "probability": <number> }],
  "breakdown": [{ "category": <string>, "amount": <number> }]
}`;

      const userPrompt = `Analyze the following project data and predict the total cost with confidence intervals, risk factors, and a cost breakdown by category.

Project snapshot:
${JSON.stringify(inputSnapshot, null, 2)}`;

      const llmResult = await callLLM(ctx.userId, ctx.db, systemPrompt, userPrompt);

      const predictedCost = Number(llmResult.predictedCost) || 0;
      const confidenceLow = Number(llmResult.confidenceLow) || 0;
      const confidenceHigh = Number(llmResult.confidenceHigh) || 0;
      const riskFactors = Array.isArray(llmResult.riskFactors)
        ? llmResult.riskFactors
        : [];
      const breakdown = Array.isArray(llmResult.breakdown)
        ? llmResult.breakdown
        : [];

      const [prediction] = await ctx.db
        .insert(costPredictions)
        .values({
          projectId: input.projectId,
          predictedCost,
          confidenceLow,
          confidenceHigh,
          riskFactors,
          breakdown,
          modelProvider: 'auto',
          inputSnapshot,
        })
        .returning();

      return prediction;
    }),

  // ── Timeline Prediction ──────────────────────────────────────
  predictTimeline: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership and gather project data
      const project = await ctx.db.query.projects.findFirst({
        where: and(
          eq(projects.id, input.projectId),
          eq(projects.userId, ctx.userId),
        ),
        with: {
          rooms: {
            with: {
              designVariants: {
                with: { bomResults: true },
              },
            },
          },
          schedules: true,
        },
      });
      if (!project) throw new Error('Project not found');

      // Build the input snapshot from project data
      const inputSnapshot = {
        projectId: project.id,
        projectName: project.name,
        status: project.status,
        rooms: project.rooms.map((room) => ({
          id: room.id,
          name: room.name,
          type: room.type,
          lengthMm: room.lengthMm,
          widthMm: room.widthMm,
          heightMm: room.heightMm,
          designVariants: room.designVariants.map((variant) => ({
            id: variant.id,
            name: variant.name,
            style: variant.style,
            budgetTier: variant.budgetTier,
            bomResults: variant.bomResults.map((bom) => ({
              id: bom.id,
              totalCost: bom.totalCost,
              items: bom.items,
            })),
          })),
        })),
        schedules: project.schedules.map((sched) => ({
          id: sched.id,
          startDate: sched.startDate,
          endDate: sched.endDate,
        })),
      };

      const systemPrompt = `You are a construction timeline estimation AI. You analyze project data including rooms, design variants, bill-of-materials results, and existing schedules to predict total project duration in days with confidence intervals. Always respond with valid JSON matching this schema:
{
  "predictedDays": <number>,
  "confidenceLow": <number>,
  "confidenceHigh": <number>,
  "criticalRisks": [{ "name": <string>, "delayDays": <number>, "mitigation": <string> }],
  "phaseBreakdown": [{ "phase": <string>, "days": <number>, "dependencies": [<string>] }]
}`;

      const userPrompt = `Analyze the following project data and predict the total timeline in days with confidence intervals, critical risks, and a phase-by-phase breakdown.

Project snapshot:
${JSON.stringify(inputSnapshot, null, 2)}`;

      const llmResult = await callLLM(ctx.userId, ctx.db, systemPrompt, userPrompt);

      const predictedDays = Math.round(Number(llmResult.predictedDays) || 0);
      const confidenceLow = Math.round(Number(llmResult.confidenceLow) || 0);
      const confidenceHigh = Math.round(Number(llmResult.confidenceHigh) || 0);
      const criticalRisks = Array.isArray(llmResult.criticalRisks)
        ? llmResult.criticalRisks
        : [];
      const phaseBreakdown = Array.isArray(llmResult.phaseBreakdown)
        ? llmResult.phaseBreakdown
        : [];

      const [prediction] = await ctx.db
        .insert(timelinePredictions)
        .values({
          projectId: input.projectId,
          predictedDays,
          confidenceLow,
          confidenceHigh,
          criticalRisks,
          phaseBreakdown,
          modelProvider: 'auto',
          inputSnapshot,
        })
        .returning();

      return prediction;
    }),

  // ── List Cost Predictions ────────────────────────────────────
  listCostPredictions: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify project ownership
      const project = await ctx.db.query.projects.findFirst({
        where: and(
          eq(projects.id, input.projectId),
          eq(projects.userId, ctx.userId),
        ),
      });
      if (!project) throw new Error('Project not found');

      return ctx.db
        .select()
        .from(costPredictions)
        .where(eq(costPredictions.projectId, input.projectId))
        .orderBy(desc(costPredictions.createdAt));
    }),

  // ── List Timeline Predictions ────────────────────────────────
  listTimelinePredictions: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify project ownership
      const project = await ctx.db.query.projects.findFirst({
        where: and(
          eq(projects.id, input.projectId),
          eq(projects.userId, ctx.userId),
        ),
      });
      if (!project) throw new Error('Project not found');

      return ctx.db
        .select()
        .from(timelinePredictions)
        .where(eq(timelinePredictions.projectId, input.projectId))
        .orderBy(desc(timelinePredictions.createdAt));
    }),
});
