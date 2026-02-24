import { z } from 'zod';
import { router, protectedProcedure } from '../init';
import { users, exchangeRates, eq, and, desc } from '@openlintel/db';
import { TRPCError } from '@trpc/server';

// ---------------------------------------------------------------------------
// Dimension conversion factors — everything normalised to millimetres
// ---------------------------------------------------------------------------
const MM_FACTORS: Record<string, number> = {
  mm: 1,
  inches: 25.4,
  feet: 304.8,
  meters: 1000,
};

export const localizationRouter = router({
  // ── 1. setPreferences ───────────────────────────────────────────────────
  setPreferences: protectedProcedure
    .input(
      z.object({
        currency: z.string().optional(),
        unitSystem: z.string().optional(),
        locale: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updates: Record<string, string> = {};
      if (input.currency !== undefined) updates.preferredCurrency = input.currency;
      if (input.unitSystem !== undefined) updates.preferredUnitSystem = input.unitSystem;
      if (input.locale !== undefined) updates.preferredLocale = input.locale;

      if (Object.keys(updates).length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'At least one preference must be provided',
        });
      }

      await ctx.db
        .update(users)
        .set(updates)
        .where(eq(users.id, ctx.userId));

      return { success: true };
    }),

  // ── 2. getPreferences ───────────────────────────────────────────────────
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
      columns: {
        preferredCurrency: true,
        preferredUnitSystem: true,
        preferredLocale: true,
      },
    });

    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    return {
      preferredCurrency: user.preferredCurrency,
      preferredUnitSystem: user.preferredUnitSystem,
      preferredLocale: user.preferredLocale,
    };
  }),

  // ── 3. getExchangeRate ──────────────────────────────────────────────────
  getExchangeRate: protectedProcedure
    .input(
      z.object({
        from: z.string(),
        to: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [rate] = await ctx.db
        .select()
        .from(exchangeRates)
        .where(
          and(
            eq(exchangeRates.fromCurrency, input.from),
            eq(exchangeRates.toCurrency, input.to),
          ),
        )
        .orderBy(desc(exchangeRates.fetchedAt))
        .limit(1);

      if (!rate) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No exchange rate found for ${input.from} → ${input.to}`,
        });
      }

      return rate;
    }),

  // ── 4. convertCurrency ──────────────────────────────────────────────────
  convertCurrency: protectedProcedure
    .input(
      z.object({
        amount: z.number(),
        from: z.string(),
        to: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.from === input.to) {
        return { convertedAmount: input.amount, rate: 1 };
      }

      const [rateRow] = await ctx.db
        .select()
        .from(exchangeRates)
        .where(
          and(
            eq(exchangeRates.fromCurrency, input.from),
            eq(exchangeRates.toCurrency, input.to),
          ),
        )
        .orderBy(desc(exchangeRates.fetchedAt))
        .limit(1);

      if (!rateRow) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No exchange rate found for ${input.from} → ${input.to}`,
        });
      }

      return {
        convertedAmount: Math.round(input.amount * rateRow.rate * 100) / 100,
        rate: rateRow.rate,
      };
    }),

  // ── 5. convertDimensions ────────────────────────────────────────────────
  convertDimensions: protectedProcedure
    .input(
      z.object({
        value: z.number(),
        fromUnit: z.enum(['mm', 'inches', 'feet', 'meters']),
        toUnit: z.enum(['mm', 'inches', 'feet', 'meters']),
      }),
    )
    .query(({ input }) => {
      if (input.fromUnit === input.toUnit) {
        return { convertedValue: input.value, fromUnit: input.fromUnit, toUnit: input.toUnit };
      }

      const valueInMm = input.value * MM_FACTORS[input.fromUnit];
      const convertedValue = Math.round((valueInMm / MM_FACTORS[input.toUnit]) * 1e6) / 1e6;

      return {
        convertedValue,
        fromUnit: input.fromUnit,
        toUnit: input.toUnit,
      };
    }),

  // ── 6. listExchangeRates ────────────────────────────────────────────────
  listExchangeRates: protectedProcedure.query(async ({ ctx }) => {
    // Get all exchange rates ordered by fetchedAt desc, then deduplicate
    // to keep only the latest rate for each currency pair.
    const allRates = await ctx.db
      .select()
      .from(exchangeRates)
      .orderBy(desc(exchangeRates.fetchedAt));

    const seen = new Set<string>();
    const latestRates = allRates.filter((r) => {
      const key = `${r.fromCurrency}:${r.toCurrency}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return latestRates;
  }),
});
