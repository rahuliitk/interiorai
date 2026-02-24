import { z } from 'zod';
import {
  projects,
  sustainabilityReports,
  eq, and, desc,
} from '@openlintel/db';
import { router, protectedProcedure } from '../init';
import { callLLM } from '@/lib/llm-client';

// ── Hardcoded emission factors (kg CO2 per kg of material) ──────────────────
const EMISSION_FACTORS: Record<string, number> = {
  wood: 0.5,
  timber: 0.5,
  plywood: 0.7,
  mdf: 0.6,
  particle_board: 0.55,
  steel: 1.8,
  stainless_steel: 6.15,
  aluminum: 8.1,
  concrete: 0.13,
  cement: 0.9,
  brick: 0.24,
  glass: 0.85,
  ceramic: 0.7,
  tile: 0.75,
  marble: 0.12,
  granite: 0.7,
  plastic: 3.5,
  pvc: 2.4,
  copper: 3.5,
  paint: 2.5,
  insulation: 1.35,
  gypsum: 0.12,
  fabric: 5.5,
  leather: 17.0,
  rubber: 3.2,
};

/**
 * Attempt to match a material name to one of our known emission factors.
 * Uses a simple lowercase substring match.
 */
function getEmissionFactor(materialName: string): number {
  const lower = materialName.toLowerCase();
  for (const [key, factor] of Object.entries(EMISSION_FACTORS)) {
    if (lower.includes(key.replace(/_/g, ' ')) || lower.includes(key)) {
      return factor;
    }
  }
  // Default factor for unknown materials
  return 1.0;
}

export const sustainabilityRouter = router({
  // ── Generate a sustainability report for a project ────────────────────────
  generateReport: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify project ownership and load BOM data
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

      // Gather all BOM items across all design variants
      const allBomItems: Array<{
        name: string;
        category: string;
        material: string;
        quantity: number;
        unit: string;
        weight_kg: number;
      }> = [];

      for (const room of project.rooms) {
        for (const variant of room.designVariants) {
          for (const bom of variant.bomResults) {
            const items = (bom.items as Array<Record<string, unknown>>) || [];
            for (const item of items) {
              allBomItems.push({
                name: String(item.name || item.description || 'Unknown'),
                category: String(item.category || 'general'),
                material: String(item.material || item.category || 'unknown'),
                quantity: Number(item.quantity || item.qty || 1),
                unit: String(item.unit || 'piece'),
                weight_kg: Number(item.weight_kg || item.weightKg || item.quantity || 1),
              });
            }
          }
        }
      }

      // Calculate base carbon from emission factors
      let materialCarbonKg = 0;
      const materialBreakdown: Array<{ name: string; material: string; carbonKg: number; weightKg: number }> = [];

      for (const item of allBomItems) {
        const factor = getEmissionFactor(item.material);
        const carbonKg = item.weight_kg * factor;
        materialCarbonKg += carbonKg;
        materialBreakdown.push({
          name: item.name,
          material: item.material,
          carbonKg: Math.round(carbonKg * 100) / 100,
          weightKg: item.weight_kg,
        });
      }

      // Estimate transport carbon as ~15% of material carbon (rough heuristic)
      const transportCarbonKg = Math.round(materialCarbonKg * 0.15 * 100) / 100;
      const totalCarbonKg = Math.round((materialCarbonKg + transportCarbonKg) * 100) / 100;
      materialCarbonKg = Math.round(materialCarbonKg * 100) / 100;

      // Call LLM for sustainability score, LEED points, and green alternatives
      const systemPrompt = `You are a sustainability and green building expert. Analyze the provided material data and carbon footprint for an interior design / construction project. Return a JSON object with:
- "sustainabilityScore": integer 0-100 (100 = very green, 0 = very polluting). Consider material choices, total carbon footprint, and potential for improvement.
- "leedPoints": integer estimate of how many LEED points (out of 110) this project might qualify for based on material choices alone (MR, EQ, and related credits).
- "greenAlternatives": array of objects, each with { "material": string (current material), "alternative": string (greener option), "carbonSaved": number (kg CO2 saved estimate), "costDelta": string (e.g. "+10%", "-5%", "similar") }. Provide 3-6 practical alternatives.
- "summary": a brief 2-3 sentence summary of the project's sustainability profile.

Always respond with valid JSON only.`;

      const userPrompt = `Project: "${project.name}"
Total materials: ${allBomItems.length} items
Total material carbon: ${materialCarbonKg} kg CO2
Transport carbon estimate: ${transportCarbonKg} kg CO2
Total carbon footprint: ${totalCarbonKg} kg CO2

Material breakdown (top items by carbon):
${materialBreakdown
  .sort((a, b) => b.carbonKg - a.carbonKg)
  .slice(0, 20)
  .map((m) => `- ${m.name} (${m.material}): ${m.weightKg} kg weight, ${m.carbonKg} kg CO2`)
  .join('\n')}

All material categories used: ${[...new Set(allBomItems.map((i) => i.material))].join(', ')}`;

      let sustainabilityScore = 50;
      let leedPoints = 0;
      let greenAlternatives: unknown[] = [];
      let modelProvider = 'fallback';

      try {
        const llmResult = await callLLM(ctx.userId, ctx.db, systemPrompt, userPrompt);
        sustainabilityScore = Math.min(100, Math.max(0, Number(llmResult.sustainabilityScore) || 50));
        leedPoints = Math.max(0, Number(llmResult.leedPoints) || 0);
        greenAlternatives = Array.isArray(llmResult.greenAlternatives) ? llmResult.greenAlternatives : [];
        modelProvider = 'user-configured';
      } catch {
        // Fallback: compute a basic score heuristically
        // Lower carbon per item = better score
        const avgCarbonPerItem = allBomItems.length > 0 ? totalCarbonKg / allBomItems.length : 0;
        if (avgCarbonPerItem < 2) sustainabilityScore = 75;
        else if (avgCarbonPerItem < 5) sustainabilityScore = 60;
        else if (avgCarbonPerItem < 15) sustainabilityScore = 45;
        else sustainabilityScore = 30;

        leedPoints = Math.round(sustainabilityScore * 0.4); // rough estimate
        greenAlternatives = [];
        modelProvider = 'fallback-heuristic';
      }

      // Store the report
      const [report] = await ctx.db
        .insert(sustainabilityReports)
        .values({
          projectId: input.projectId,
          totalCarbonKg,
          materialCarbonKg,
          transportCarbonKg,
          sustainabilityScore,
          leedPoints,
          greenAlternatives,
          modelProvider,
        })
        .returning();

      return report;
    }),

  // ── Get a single report by ID ─────────────────────────────────────────────
  getReport: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const report = await ctx.db.query.sustainabilityReports.findFirst({
        where: eq(sustainabilityReports.id, input.id),
        with: { project: true },
      });
      if (!report) throw new Error('Sustainability report not found');
      if (report.project.userId !== ctx.userId) throw new Error('Access denied');

      return report;
    }),

  // ── List all reports for a project ────────────────────────────────────────
  listReports: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify project ownership
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      return ctx.db.query.sustainabilityReports.findMany({
        where: eq(sustainabilityReports.projectId, input.projectId),
        orderBy: [desc(sustainabilityReports.createdAt)],
      });
    }),
});
