import { z } from 'zod';
import { createHash, randomBytes } from 'crypto';
import {
  developerApps, apiAccessTokens, apiRequestLogs, webhookSubscriptions,
  eq, and, sql, count,
} from '@openlintel/db';
import { router, protectedProcedure } from '../init';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function generateClientSecret(): string {
  return randomBytes(32).toString('hex');
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const developerPortalRouter = router({
  // ── 1. Create App ────────────────────────────────────────────
  createApp: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        redirectUris: z.array(z.string().url()).optional(),
        scopes: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const clientId = crypto.randomUUID();
      const clientSecret = generateClientSecret();
      const clientSecretHash = hashSecret(clientSecret);

      const [app] = await ctx.db
        .insert(developerApps)
        .values({
          userId: ctx.userId,
          name: input.name,
          clientId,
          clientSecretHash,
          redirectUris: input.redirectUris ?? [],
          scopes: input.scopes ?? [],
        })
        .returning();

      // Return the app with the plaintext secret (only shown once)
      return { ...app!, clientSecret };
    }),

  // ── 2. List Apps ─────────────────────────────────────────────
  listApps: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.developerApps.findMany({
      where: eq(developerApps.userId, ctx.userId),
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    });
  }),

  // ── 3. Get App ───────────────────────────────────────────────
  getApp: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const app = await ctx.db.query.developerApps.findFirst({
        where: and(eq(developerApps.id, input.id), eq(developerApps.userId, ctx.userId)),
      });
      if (!app) throw new Error('App not found');

      // Fetch usage stats summary
      const [statsRow] = await ctx.db
        .select({
          totalRequests: count(),
          avgResponseTime: sql<number>`COALESCE(AVG(${apiRequestLogs.responseTimeMs}), 0)`,
          errorCount: sql<number>`COUNT(*) FILTER (WHERE ${apiRequestLogs.statusCode} >= 400)`,
        })
        .from(apiRequestLogs)
        .where(eq(apiRequestLogs.appId, app.id));

      const totalRequests = Number(statsRow?.totalRequests) || 0;
      const avgResponseTime = Math.round(Number(statsRow?.avgResponseTime) || 0);
      const errorCount = Number(statsRow?.errorCount) || 0;
      const errorRate = totalRequests > 0 ? Math.round((errorCount / totalRequests) * 10000) / 100 : 0;

      // Active token count
      const [tokenRow] = await ctx.db
        .select({ count: count() })
        .from(apiAccessTokens)
        .where(
          and(
            eq(apiAccessTokens.appId, app.id),
            sql`${apiAccessTokens.expiresAt} > NOW()`,
          ),
        );
      const activeTokens = Number(tokenRow?.count) || 0;

      // Webhook count
      const [webhookRow] = await ctx.db
        .select({ count: count() })
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.appId, app.id));
      const webhookCount = Number(webhookRow?.count) || 0;

      return {
        ...app,
        usageSummary: {
          totalRequests,
          avgResponseTime,
          errorRate,
          activeTokens,
          webhookCount,
        },
      };
    }),

  // ── 4. Update App ────────────────────────────────────────────
  updateApp: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        redirectUris: z.array(z.string().url()).optional(),
        scopes: z.array(z.string()).optional(),
        status: z.enum(['active', 'suspended', 'revoked']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const app = await ctx.db.query.developerApps.findFirst({
        where: and(eq(developerApps.id, input.id), eq(developerApps.userId, ctx.userId)),
      });
      if (!app) throw new Error('App not found');

      const { id, ...updates } = input;
      // Only include fields that were actually provided
      const setData: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.name !== undefined) setData.name = updates.name;
      if (updates.redirectUris !== undefined) setData.redirectUris = updates.redirectUris;
      if (updates.scopes !== undefined) setData.scopes = updates.scopes;
      if (updates.status !== undefined) setData.status = updates.status;

      const [updated] = await ctx.db
        .update(developerApps)
        .set(setData)
        .where(eq(developerApps.id, id))
        .returning();

      return updated;
    }),

  // ── 5. Rotate Secret ─────────────────────────────────────────
  rotateSecret: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const app = await ctx.db.query.developerApps.findFirst({
        where: and(eq(developerApps.id, input.id), eq(developerApps.userId, ctx.userId)),
      });
      if (!app) throw new Error('App not found');

      const clientSecret = generateClientSecret();
      const clientSecretHash = hashSecret(clientSecret);

      const [updated] = await ctx.db
        .update(developerApps)
        .set({ clientSecretHash, updatedAt: new Date() })
        .where(eq(developerApps.id, input.id))
        .returning();

      return { ...updated!, clientSecret };
    }),

  // ── 6. Revoke App ────────────────────────────────────────────
  revokeApp: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const app = await ctx.db.query.developerApps.findFirst({
        where: and(eq(developerApps.id, input.id), eq(developerApps.userId, ctx.userId)),
      });
      if (!app) throw new Error('App not found');

      const [updated] = await ctx.db
        .update(developerApps)
        .set({ status: 'revoked', updatedAt: new Date() })
        .where(eq(developerApps.id, input.id))
        .returning();

      return updated;
    }),

  // ── 7. Create Webhook ────────────────────────────────────────
  createWebhook: protectedProcedure
    .input(
      z.object({
        appId: z.string(),
        eventType: z.string().min(1),
        targetUrl: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify app ownership
      const app = await ctx.db.query.developerApps.findFirst({
        where: and(eq(developerApps.id, input.appId), eq(developerApps.userId, ctx.userId)),
      });
      if (!app) throw new Error('App not found');

      const secret = randomBytes(32).toString('hex');

      const [webhook] = await ctx.db
        .insert(webhookSubscriptions)
        .values({
          appId: input.appId,
          eventType: input.eventType,
          targetUrl: input.targetUrl,
          secret,
        })
        .returning();

      return webhook;
    }),

  // ── 8. List Webhooks ─────────────────────────────────────────
  listWebhooks: protectedProcedure
    .input(z.object({ appId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify app ownership
      const app = await ctx.db.query.developerApps.findFirst({
        where: and(eq(developerApps.id, input.appId), eq(developerApps.userId, ctx.userId)),
      });
      if (!app) throw new Error('App not found');

      return ctx.db.query.webhookSubscriptions.findMany({
        where: eq(webhookSubscriptions.appId, input.appId),
        orderBy: (w, { desc }) => [desc(w.createdAt)],
      });
    }),

  // ── 9. Test Webhook ──────────────────────────────────────────
  testWebhook: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const webhook = await ctx.db.query.webhookSubscriptions.findFirst({
        where: eq(webhookSubscriptions.id, input.id),
      });
      if (!webhook) throw new Error('Webhook not found');

      // Verify app ownership
      const app = await ctx.db.query.developerApps.findFirst({
        where: and(eq(developerApps.id, webhook.appId), eq(developerApps.userId, ctx.userId)),
      });
      if (!app) throw new Error('App not found');

      const testPayload = {
        event: webhook.eventType,
        timestamp: new Date().toISOString(),
        test: true,
        data: { message: 'This is a test webhook delivery from OpenLintel.' },
      };

      // Sign the payload with the webhook secret
      const signature = createHash('sha256')
        .update(JSON.stringify(testPayload) + webhook.secret)
        .digest('hex');

      try {
        const response = await fetch(webhook.targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': webhook.eventType,
          },
          body: JSON.stringify(testPayload),
          signal: AbortSignal.timeout(10_000), // 10s timeout
        });

        if (response.ok) {
          // Reset failure count on success
          await ctx.db
            .update(webhookSubscriptions)
            .set({ status: 'active', failureCount: 0 })
            .where(eq(webhookSubscriptions.id, input.id));

          return { success: true, statusCode: response.status };
        }

        // Increment failure count
        await ctx.db
          .update(webhookSubscriptions)
          .set({ failureCount: (webhook.failureCount ?? 0) + 1 })
          .where(eq(webhookSubscriptions.id, input.id));

        return { success: false, statusCode: response.status, error: response.statusText };
      } catch (err) {
        // Increment failure count
        await ctx.db
          .update(webhookSubscriptions)
          .set({ failureCount: (webhook.failureCount ?? 0) + 1 })
          .where(eq(webhookSubscriptions.id, input.id));

        return {
          success: false,
          statusCode: null,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }),

  // ── 10. Delete Webhook ───────────────────────────────────────
  deleteWebhook: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const webhook = await ctx.db.query.webhookSubscriptions.findFirst({
        where: eq(webhookSubscriptions.id, input.id),
      });
      if (!webhook) throw new Error('Webhook not found');

      // Verify app ownership
      const app = await ctx.db.query.developerApps.findFirst({
        where: and(eq(developerApps.id, webhook.appId), eq(developerApps.userId, ctx.userId)),
      });
      if (!app) throw new Error('App not found');

      await ctx.db
        .delete(webhookSubscriptions)
        .where(eq(webhookSubscriptions.id, input.id));

      return { success: true };
    }),

  // ── 11. Get Usage Stats ──────────────────────────────────────
  getUsageStats: protectedProcedure
    .input(
      z.object({
        appId: z.string(),
        days: z.number().int().min(1).max(365).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify app ownership
      const app = await ctx.db.query.developerApps.findFirst({
        where: and(eq(developerApps.id, input.appId), eq(developerApps.userId, ctx.userId)),
      });
      if (!app) throw new Error('App not found');

      const since = new Date();
      since.setDate(since.getDate() - input.days);

      // Aggregate stats
      const [statsRow] = await ctx.db
        .select({
          totalRequests: count(),
          avgResponseTime: sql<number>`COALESCE(AVG(${apiRequestLogs.responseTimeMs}), 0)`,
          errorCount: sql<number>`COUNT(*) FILTER (WHERE ${apiRequestLogs.statusCode} >= 400)`,
        })
        .from(apiRequestLogs)
        .where(
          and(
            eq(apiRequestLogs.appId, input.appId),
            sql`${apiRequestLogs.createdAt} >= ${since}`,
          ),
        );

      const totalRequests = Number(statsRow?.totalRequests) || 0;
      const avgResponseTime = Math.round(Number(statsRow?.avgResponseTime) || 0);
      const errorCount = Number(statsRow?.errorCount) || 0;
      const errorRate = totalRequests > 0 ? Math.round((errorCount / totalRequests) * 10000) / 100 : 0;

      // Requests by endpoint
      const requestsByEndpoint = await ctx.db
        .select({
          endpoint: apiRequestLogs.endpoint,
          count: count(),
          avgResponseTime: sql<number>`COALESCE(AVG(${apiRequestLogs.responseTimeMs}), 0)`,
        })
        .from(apiRequestLogs)
        .where(
          and(
            eq(apiRequestLogs.appId, input.appId),
            sql`${apiRequestLogs.createdAt} >= ${since}`,
          ),
        )
        .groupBy(apiRequestLogs.endpoint)
        .orderBy(sql`count(*) DESC`);

      // Requests by day
      const requestsByDay = await ctx.db
        .select({
          date: sql<string>`TO_CHAR(${apiRequestLogs.createdAt}, 'YYYY-MM-DD')`,
          count: count(),
          errorCount: sql<number>`COUNT(*) FILTER (WHERE ${apiRequestLogs.statusCode} >= 400)`,
        })
        .from(apiRequestLogs)
        .where(
          and(
            eq(apiRequestLogs.appId, input.appId),
            sql`${apiRequestLogs.createdAt} >= ${since}`,
          ),
        )
        .groupBy(sql`TO_CHAR(${apiRequestLogs.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(${apiRequestLogs.createdAt}, 'YYYY-MM-DD')`);

      return {
        totalRequests,
        avgResponseTime,
        errorRate,
        requestsByEndpoint: requestsByEndpoint.map((r) => ({
          endpoint: r.endpoint,
          count: Number(r.count),
          avgResponseTime: Math.round(Number(r.avgResponseTime)),
        })),
        requestsByDay: requestsByDay.map((r) => ({
          date: r.date,
          count: Number(r.count),
          errorCount: Number(r.errorCount),
        })),
      };
    }),
});
