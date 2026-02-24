import { z } from 'zod';
import { userApiKeys, eq, and } from '@openlintel/db';
import { router, protectedProcedure } from '../init';
import { encryptApiKey } from '@/lib/crypto';

export const apiKeyRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const keys = await ctx.db.query.userApiKeys.findMany({
      where: eq(userApiKeys.userId, ctx.userId),
      orderBy: (k, { desc }) => [desc(k.createdAt)],
    });

    // Never return encryption material to the client
    return keys.map(({ encryptedKey: _ek, iv: _iv, authTag: _at, ...safe }) => safe);
  }),

  create: protectedProcedure
    .input(
      z.object({
        provider: z.enum(['openai', 'anthropic', 'google', 'replicate']),
        label: z.string().min(1).max(100),
        key: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { encryptedKey, iv, authTag, keyPrefix } = encryptApiKey(input.key);

      const [apiKey] = await ctx.db
        .insert(userApiKeys)
        .values({
          userId: ctx.userId,
          provider: input.provider,
          label: input.label,
          encryptedKey,
          iv,
          authTag,
          keyPrefix,
        })
        .returning();

      // Return only safe fields — strip encryption material
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { encryptedKey: _ek, iv: _iv, authTag: _at, ...safe } = apiKey!;
      return safe;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const key = await ctx.db.query.userApiKeys.findFirst({
        where: and(eq(userApiKeys.id, input.id), eq(userApiKeys.userId, ctx.userId)),
      });
      if (!key) throw new Error('API key not found');

      await ctx.db.delete(userApiKeys).where(eq(userApiKeys.id, input.id));
      return { success: true };
    }),
});
