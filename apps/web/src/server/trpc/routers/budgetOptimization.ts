import { z } from 'zod';
import {
  projects, budgetScenarios,
  eq, and, desc,
} from '@openlintel/db';
import { router, protectedProcedure } from '../init';
import { callLLM } from '@/lib/llm-client';

export const budgetOptimizationRouter = router({
  /**
   * Generate a new budget optimization scenario using AI.
   * Gathers all BOM data for the project, calls the LLM to suggest
   * material substitutions, and persists the result.
   */
  generateScenario: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        targetBudget: z.number().optional(),
        constraints: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify project ownership and gather BOM data
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
        with: {
          rooms: {
            with: {
              designVariants: {
                with: { bomResults: true },
              },
            },
          },
        },
      });
      if (!project) throw new Error('Project not found');

      // Flatten all BOM items across every room / variant
      const allBomItems: Array<{
        roomName: string;
        variantName: string;
        items: unknown;
        totalCost: number | null;
      }> = [];

      let originalTotalCost = 0;

      project.rooms.forEach((room) => {
        room.designVariants.forEach((variant) => {
          variant.bomResults.forEach((bom) => {
            const cost = bom.totalCost ?? 0;
            originalTotalCost += cost;
            allBomItems.push({
              roomName: room.name,
              variantName: variant.name,
              items: bom.items,
              totalCost: bom.totalCost,
            });
          });
        });
      });

      if (allBomItems.length === 0) {
        throw new Error('No BOM data found for this project. Generate BOMs first.');
      }

      // Build the LLM prompt
      const systemPrompt = `You are an expert interior design cost optimiser. Given a Bill of Materials for an interior design project, suggest material substitutions that reduce cost while maintaining quality and aesthetics.

Respond with valid JSON in this exact shape:
{
  "substitutions": [
    {
      "original": "Original material / item name",
      "replacement": "Suggested replacement material / item",
      "originalCost": <number>,
      "replacementCost": <number>,
      "savings": <number>,
      "reason": "Brief justification"
    }
  ],
  "optimizedTotalCost": <number>,
  "summary": "One-paragraph summary of the optimisation strategy"
}`;

      const constraintText =
        input.constraints && input.constraints.length > 0
          ? `\n\nUser constraints:\n${input.constraints.map((c) => `- ${c}`).join('\n')}`
          : '';

      const budgetText =
        input.targetBudget !== undefined
          ? `\nTarget budget: ${input.targetBudget}`
          : '';

      const userPrompt = `Project: ${project.name}
Original total cost: ${originalTotalCost}${budgetText}${constraintText}

BOM Data:
${JSON.stringify(allBomItems, null, 2)}

Suggest material substitutions to reduce the total cost. Keep quality reasonable.`;

      // Call the LLM
      const llmResult = await callLLM(ctx.userId, ctx.db, systemPrompt, userPrompt);

      const substitutions = (llmResult.substitutions as Array<Record<string, unknown>>) ?? [];
      const optimizedTotalCost =
        typeof llmResult.optimizedTotalCost === 'number'
          ? llmResult.optimizedTotalCost
          : originalTotalCost;

      const savingsAmount = originalTotalCost - optimizedTotalCost;
      const savingsPercent =
        originalTotalCost > 0
          ? Math.round((savingsAmount / originalTotalCost) * 10000) / 100
          : 0;

      // Determine scenario number for naming
      const existingScenarios = await ctx.db.query.budgetScenarios.findMany({
        where: eq(budgetScenarios.projectId, input.projectId),
      });
      const scenarioNumber = existingScenarios.length + 1;

      // Persist the scenario
      const [scenario] = await ctx.db
        .insert(budgetScenarios)
        .values({
          projectId: input.projectId,
          name: `Scenario #${scenarioNumber}`,
          originalTotalCost,
          optimizedTotalCost,
          savingsAmount,
          savingsPercent,
          substitutions,
          constraints: input.constraints ?? [],
          status: 'draft',
        })
        .returning();

      return scenario;
    }),

  /**
   * List all budget scenarios for a project, newest first.
   */
  listScenarios: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify project ownership
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      return ctx.db.query.budgetScenarios.findMany({
        where: eq(budgetScenarios.projectId, input.projectId),
        orderBy: [desc(budgetScenarios.createdAt)],
      });
    }),

  /**
   * Get a single budget scenario by ID.
   */
  getScenario: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const scenario = await ctx.db.query.budgetScenarios.findFirst({
        where: eq(budgetScenarios.id, input.id),
        with: { project: true },
      });
      if (!scenario) throw new Error('Scenario not found');
      if (scenario.project.userId !== ctx.userId) throw new Error('Access denied');

      return scenario;
    }),

  /**
   * Accept a budget scenario — marks its status as 'accepted'.
   */
  acceptScenario: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership through the project relation
      const scenario = await ctx.db.query.budgetScenarios.findFirst({
        where: eq(budgetScenarios.id, input.id),
        with: { project: true },
      });
      if (!scenario) throw new Error('Scenario not found');
      if (scenario.project.userId !== ctx.userId) throw new Error('Access denied');

      const [updated] = await ctx.db
        .update(budgetScenarios)
        .set({ status: 'accepted' })
        .where(eq(budgetScenarios.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * Ask a what-if question about the project budget, answered by the LLM
   * using the project's BOM data as context.
   */
  whatIf: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        question: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify project ownership and gather BOM data
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
        with: {
          rooms: {
            with: {
              designVariants: {
                with: { bomResults: true },
              },
            },
          },
        },
      });
      if (!project) throw new Error('Project not found');

      // Flatten BOM items
      const allBomItems: Array<{
        roomName: string;
        variantName: string;
        items: unknown;
        totalCost: number | null;
      }> = [];

      let totalCost = 0;

      project.rooms.forEach((room) => {
        room.designVariants.forEach((variant) => {
          variant.bomResults.forEach((bom) => {
            totalCost += bom.totalCost ?? 0;
            allBomItems.push({
              roomName: room.name,
              variantName: variant.name,
              items: bom.items,
              totalCost: bom.totalCost,
            });
          });
        });
      });

      const systemPrompt = `You are an expert interior design cost analyst. The user is asking a "what-if" question about their project budget. Analyse the BOM data and answer the question.

Respond with valid JSON in this exact shape:
{
  "answer": "A clear, detailed answer to the user's question",
  "estimatedImpact": <number representing the estimated cost change in currency units — positive means cost increase, negative means savings>
}`;

      const userPrompt = `Project: ${project.name}
Current total cost: ${totalCost}

BOM Data:
${JSON.stringify(allBomItems, null, 2)}

Question: ${input.question}`;

      const llmResult = await callLLM(ctx.userId, ctx.db, systemPrompt, userPrompt);

      return {
        answer: typeof llmResult.answer === 'string' ? llmResult.answer : String(llmResult.raw ?? ''),
        estimatedImpact: typeof llmResult.estimatedImpact === 'number' ? llmResult.estimatedImpact : 0,
      };
    }),
});
