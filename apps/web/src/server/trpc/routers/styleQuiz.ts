import { z } from 'zod';
import { router, protectedProcedure } from '../init';
import {
  stylePreferences, projects, eq, and,
} from '@openlintel/db';

export const styleQuizRouter = router({
  // ── Get or create style preferences ──────────────────────
  get: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');
      return ctx.db.query.stylePreferences.findFirst({
        where: eq(stylePreferences.projectId, input.projectId),
      }) ?? null;
    }),

  // ── Save quiz responses ──────────────────────────────────
  saveQuizResponses: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      quizResponses: z.array(z.object({
        questionId: z.string(),
        selectedOption: z.string(),
      })),
      budgetTier: z.enum(['economy', 'mid_range', 'premium', 'luxury']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
      });
      if (!project) throw new Error('Project not found');

      // Derive styles from quiz responses
      const styleScores: Record<string, number> = {};
      const styleMap: Record<string, string[]> = {
        'minimal': ['clean_lines', 'neutral', 'less_furniture'],
        'modern': ['geometric', 'bold_color', 'mixed_materials'],
        'traditional': ['ornate', 'warm_wood', 'classic_patterns'],
        'industrial': ['exposed_brick', 'metal', 'raw_finishes'],
        'scandinavian': ['light_wood', 'white', 'cozy_textiles'],
        'bohemian': ['colorful', 'eclectic', 'plants'],
      };
      input.quizResponses.forEach((r) => {
        Object.entries(styleMap).forEach(([style, keywords]) => {
          if (keywords.some((kw) => r.selectedOption.toLowerCase().includes(kw))) {
            styleScores[style] = (styleScores[style] || 0) + 1;
          }
        });
      });
      const detectedStyles = Object.entries(styleScores)
        .map(([style, score]) => ({ style, score }))
        .sort((a, b) => b.score - a.score);

      const existing = await ctx.db.query.stylePreferences.findFirst({
        where: eq(stylePreferences.projectId, input.projectId),
      });

      if (existing) {
        const [updated] = await ctx.db.update(stylePreferences).set({
          quizResponses: input.quizResponses,
          detectedStyles,
          budgetTier: input.budgetTier ?? existing.budgetTier,
          updatedAt: new Date(),
        }).where(eq(stylePreferences.id, existing.id)).returning();
        return updated;
      }

      const [pref] = await ctx.db.insert(stylePreferences).values({
        projectId: input.projectId,
        quizResponses: input.quizResponses,
        detectedStyles,
        budgetTier: input.budgetTier ?? null,
      }).returning();
      return pref;
    }),

  // ── Save color preferences ───────────────────────────────
  saveColorPreferences: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      colorPreferences: z.object({
        palette: z.array(z.string()),
        warm: z.boolean(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.stylePreferences.findFirst({
        where: eq(stylePreferences.projectId, input.projectId),
      });
      if (!existing) {
        const [pref] = await ctx.db.insert(stylePreferences).values({
          projectId: input.projectId,
          colorPreferences: input.colorPreferences,
        }).returning();
        return pref;
      }
      const [updated] = await ctx.db.update(stylePreferences).set({
        colorPreferences: input.colorPreferences,
        updatedAt: new Date(),
      }).where(eq(stylePreferences.id, existing.id)).returning();
      return updated;
    }),

  // ── Save mood board items ────────────────────────────────
  saveMoodBoard: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      moodBoardItems: z.array(z.object({
        imageUrl: z.string(),
        caption: z.string().optional(),
        source: z.string().optional(),
        category: z.string().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.stylePreferences.findFirst({
        where: eq(stylePreferences.projectId, input.projectId),
      });
      if (!existing) {
        const [pref] = await ctx.db.insert(stylePreferences).values({
          projectId: input.projectId,
          moodBoardItems: input.moodBoardItems,
        }).returning();
        return pref;
      }
      const [updated] = await ctx.db.update(stylePreferences).set({
        moodBoardItems: input.moodBoardItems,
        updatedAt: new Date(),
      }).where(eq(stylePreferences.id, existing.id)).returning();
      return updated;
    }),

  // ── Save inspiration URLs ────────────────────────────────
  saveInspirationUrls: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      inspirationUrls: z.array(z.string().url()),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.stylePreferences.findFirst({
        where: eq(stylePreferences.projectId, input.projectId),
      });
      if (!existing) {
        const [pref] = await ctx.db.insert(stylePreferences).values({
          projectId: input.projectId,
          inspirationUrls: input.inspirationUrls,
        }).returning();
        return pref;
      }
      const [updated] = await ctx.db.update(stylePreferences).set({
        inspirationUrls: input.inspirationUrls,
        updatedAt: new Date(),
      }).where(eq(stylePreferences.id, existing.id)).returning();
      return updated;
    }),
});
