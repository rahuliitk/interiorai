import { z } from 'zod';
import { eq, and, sql, like, or, desc, count } from 'drizzle-orm';
import { users, projects, jobs } from '@openlintel/db';
import { router, adminProcedure } from '../init';

const SERVICE_URLS: Record<string, string> = {
  'design-engine': process.env.DESIGN_SERVICE_URL || 'http://localhost:8001',
  'bom-engine': process.env.BOM_SERVICE_URL || 'http://localhost:8002',
  'drawing-generator': process.env.DRAWING_SERVICE_URL || 'http://localhost:8003',
  'cutlist-engine': process.env.CUTLIST_SERVICE_URL || 'http://localhost:8004',
  'mep-calculator': process.env.MEP_SERVICE_URL || 'http://localhost:8005',
  'catalogue-service': process.env.CATALOGUE_SERVICE_URL || 'http://localhost:8006',
  'project-service': process.env.PROJECT_SERVICE_URL || 'http://localhost:8007',
  'procurement-service': process.env.PROCUREMENT_SERVICE_URL || 'http://localhost:8008',
  'media-service': process.env.MEDIA_SERVICE_URL || 'http://localhost:8009',
  'collaboration': process.env.COLLABORATION_SERVICE_URL || 'http://localhost:8010',
};

const INFRA_CHECKS: Record<string, { url: string; label: string }> = {
  PostgreSQL: { url: '', label: 'PostgreSQL' }, // checked via DB query
  Redis: { url: process.env.REDIS_URL || 'http://localhost:6379', label: 'Redis' },
  MinIO: { url: process.env.MINIO_ENDPOINT || 'http://localhost:9000', label: 'MinIO' },
  Meilisearch: {
    url: process.env.MEILISEARCH_URL || 'http://localhost:7700',
    label: 'Meilisearch',
  },
};

async function checkServiceHealth(
  url: string,
): Promise<{ status: 'healthy' | 'degraded' | 'down'; latencyMs: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${url}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    if (res.ok) return { status: 'healthy', latencyMs };
    return { status: 'degraded', latencyMs };
  } catch {
    return { status: 'down', latencyMs: Date.now() - start };
  }
}

export const adminRouter = router({
  // ─── Dashboard Stats ───────────────────────────────────────────────
  getStats: adminProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [
      [{ value: totalUsers }],
      [{ value: newUsersThisWeek }],
      [{ value: newUsersPrevWeek }],
      [{ value: totalProjects }],
      [{ value: activeProjects }],
      [{ value: runningJobs }],
      [{ value: queuedJobs }],
    ] = await Promise.all([
      ctx.db.select({ value: count() }).from(users),
      ctx.db
        .select({ value: count() })
        .from(users)
        .where(sql`${users.createdAt} >= ${oneWeekAgo}`),
      ctx.db
        .select({ value: count() })
        .from(users)
        .where(
          and(
            sql`${users.createdAt} >= ${twoWeeksAgo}`,
            sql`${users.createdAt} < ${oneWeekAgo}`,
          ),
        ),
      ctx.db.select({ value: count() }).from(projects),
      ctx.db
        .select({ value: count() })
        .from(projects)
        .where(eq(projects.status, 'active')),
      ctx.db
        .select({ value: count() })
        .from(jobs)
        .where(eq(jobs.status, 'running')),
      ctx.db
        .select({ value: count() })
        .from(jobs)
        .where(eq(jobs.status, 'pending')),
    ]);

    const userGrowthPercent =
      newUsersPrevWeek > 0
        ? Math.round(((newUsersThisWeek - newUsersPrevWeek) / newUsersPrevWeek) * 100)
        : newUsersThisWeek > 0
          ? 100
          : 0;

    return {
      totalUsers,
      newUsersThisWeek,
      userGrowthPercent,
      totalProjects,
      activeProjects,
      runningJobs,
      queuedJobs,
    };
  }),

  // ─── Recent Activity ───────────────────────────────────────────────
  getRecentActivity: adminProcedure.query(async ({ ctx }) => {
    const recentJobs = await ctx.db
      .select({
        id: jobs.id,
        type: jobs.type,
        status: jobs.status,
        createdAt: jobs.createdAt,
        userName: users.name,
      })
      .from(jobs)
      .innerJoin(users, eq(jobs.userId, users.id))
      .orderBy(desc(jobs.createdAt))
      .limit(20);

    return recentJobs.map((job) => ({
      id: job.id,
      type: job.type,
      description: `Job ${job.type.replace(/_/g, ' ')} — ${job.status}`,
      userName: job.userName ?? 'Unknown',
      createdAt: job.createdAt.toISOString(),
    }));
  }),

  // ─── System Health ─────────────────────────────────────────────────
  getSystemHealth: adminProcedure.query(async ({ ctx }) => {
    // Check DB (PostgreSQL) via a simple query
    const dbStart = Date.now();
    let dbStatus: 'healthy' | 'degraded' | 'down' = 'down';
    let dbLatency = 0;
    try {
      await ctx.db.execute(sql`SELECT 1`);
      dbLatency = Date.now() - dbStart;
      dbStatus = dbLatency > 500 ? 'degraded' : 'healthy';
    } catch {
      dbLatency = Date.now() - dbStart;
    }

    // Check infrastructure services
    const infraPromises = Object.entries(INFRA_CHECKS).map(
      async ([name, config]) => {
        if (name === 'PostgreSQL') {
          return { name, status: dbStatus, latencyMs: dbLatency };
        }
        const health = await checkServiceHealth(config.url);
        return { name, ...health };
      },
    );

    // Check microservices
    const microPromises = Object.entries(SERVICE_URLS).map(
      async ([name, url]) => {
        const health = await checkServiceHealth(url);
        return {
          name,
          status: health.status === 'healthy'
            ? ('running' as const)
            : health.status === 'degraded'
              ? ('running' as const)
              : ('stopped' as const),
          port: parseInt(new URL(url).port) || 80,
          latencyMs: health.latencyMs,
        };
      },
    );

    const [infrastructure, microservices] = await Promise.all([
      Promise.all(infraPromises),
      Promise.all(microPromises),
    ]);

    const allServices = [...infrastructure, ...microservices];
    const servicesUp = allServices.filter(
      (s) =>
        s.status === 'healthy' ||
        s.status === 'running',
    ).length;

    return {
      overallStatus:
        servicesUp === allServices.length
          ? 'healthy'
          : servicesUp > allServices.length / 2
            ? 'degraded'
            : 'down',
      servicesUp,
      totalServices: allServices.length,
      services: infrastructure.map((s) => ({
        name: s.name,
        status: s.status,
        latencyMs: s.latencyMs,
      })),
      infrastructure,
      microservices,
    };
  }),

  // ─── Resource Usage ────────────────────────────────────────────────
  getResourceUsage: adminProcedure.query(async ({ ctx }) => {
    // Get DB size from PostgreSQL
    let dbSizeGb = 0;
    try {
      const result = await ctx.db.execute(
        sql`SELECT pg_database_size(current_database()) as size`,
      );
      const rows = result as unknown as { size: string }[];
      if (rows.length > 0) {
        dbSizeGb = parseFloat(rows[0].size) / (1024 * 1024 * 1024);
      }
    } catch {
      // DB size query may fail on some configurations
    }

    return {
      cpuPercent: 0, // Would need OS-level monitoring (e.g., Prometheus)
      memoryPercent: 0,
      memoryUsedGb: 0,
      memoryTotalGb: 0,
      storage: [
        {
          label: 'PostgreSQL Storage',
          totalGb: 20, // Provisioned size
          usedGb: Math.round(dbSizeGb * 100) / 100,
        },
      ],
    };
  }),

  // ─── User Management ───────────────────────────────────────────────
  listUsers: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        role: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [];
      if (input.search) {
        conditions.push(
          or(
            like(users.name, `%${input.search}%`),
            like(users.email, `%${input.search}%`),
          ),
        );
      }
      if (input.role) {
        conditions.push(eq(users.role, input.role));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [userRows, [{ value: totalCount }]] = await Promise.all([
        ctx.db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            enabled: users.enabled,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(whereClause)
          .orderBy(desc(users.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        ctx.db.select({ value: count() }).from(users).where(whereClause),
      ]);

      // Get project counts per user
      const userIds = userRows.map((u) => u.id);
      const projectCounts =
        userIds.length > 0
          ? await ctx.db
              .select({
                userId: projects.userId,
                count: count(),
              })
              .from(projects)
              .where(sql`${projects.userId} IN ${userIds}`)
              .groupBy(projects.userId)
          : [];

      const countsMap = new Map(
        projectCounts.map((pc) => [pc.userId, pc.count]),
      );

      return {
        users: userRows.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
          projectsCount: countsMap.get(u.id) ?? 0,
        })),
        totalCount,
      };
    }),

  updateUserRole: adminProcedure
    .input(z.object({ userId: z.string(), role: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({ role: input.role })
        .where(eq(users.id, input.userId));
      return { success: true };
    }),

  toggleUserStatus: adminProcedure
    .input(z.object({ userId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({ enabled: input.enabled })
        .where(eq(users.id, input.userId));
      return { success: true };
    }),

  // ─── Job Management ────────────────────────────────────────────────
  listJobs: adminProcedure
    .input(
      z.object({
        type: z.string().optional(),
        status: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(25),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [];
      if (input.type) conditions.push(eq(jobs.type, input.type));
      if (input.status) conditions.push(eq(jobs.status, input.status));
      if (input.search) {
        conditions.push(
          or(
            like(jobs.id, `%${input.search}%`),
            like(jobs.type, `%${input.search}%`),
          ),
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [jobRows, [{ value: totalCount }], [{ value: queuedCount }], [{ value: runningCount }], [{ value: failedCount }]] =
        await Promise.all([
          ctx.db
            .select({
              id: jobs.id,
              type: jobs.type,
              status: jobs.status,
              progress: jobs.progress,
              createdAt: jobs.createdAt,
              startedAt: jobs.startedAt,
              completedAt: jobs.completedAt,
              error: jobs.error,
              userName: users.name,
            })
            .from(jobs)
            .innerJoin(users, eq(jobs.userId, users.id))
            .where(whereClause)
            .orderBy(desc(jobs.createdAt))
            .limit(input.limit)
            .offset(input.offset),
          ctx.db.select({ value: count() }).from(jobs).where(whereClause),
          ctx.db
            .select({ value: count() })
            .from(jobs)
            .where(eq(jobs.status, 'pending')),
          ctx.db
            .select({ value: count() })
            .from(jobs)
            .where(eq(jobs.status, 'running')),
          ctx.db
            .select({ value: count() })
            .from(jobs)
            .where(eq(jobs.status, 'failed')),
        ]);

      return {
        jobs: jobRows.map((j) => ({
          id: j.id,
          type: j.type,
          status: j.status,
          progress: j.progress ?? 0,
          createdAt: j.createdAt.toISOString(),
          userName: j.userName ?? 'Unknown',
          error: j.error ?? undefined,
          durationMs:
            j.startedAt && j.completedAt
              ? j.completedAt.getTime() - j.startedAt.getTime()
              : j.startedAt
                ? Date.now() - j.startedAt.getTime()
                : undefined,
        })),
        totalCount,
        queuedCount,
        runningCount,
        failedCount,
      };
    }),

  cancelJob: adminProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(jobs)
        .set({ status: 'cancelled', completedAt: new Date() })
        .where(
          and(
            eq(jobs.id, input.jobId),
            or(eq(jobs.status, 'pending'), eq(jobs.status, 'running')),
          ),
        );
      return { success: true };
    }),

  retryJob: adminProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.query.jobs.findFirst({
        where: eq(jobs.id, input.jobId),
      });
      if (!job) throw new Error('Job not found');
      if (job.status !== 'failed') throw new Error('Only failed jobs can be retried');

      // Reset job to pending
      await ctx.db
        .update(jobs)
        .set({
          status: 'pending',
          progress: 0,
          error: null,
          startedAt: null,
          completedAt: null,
        })
        .where(eq(jobs.id, input.jobId));

      // Re-trigger the corresponding service
      const serviceMap: Record<string, string> = {
        design_generation: 'design-engine',
        bom_calculation: 'bom-engine',
        drawing_generation: 'drawing-generator',
        cutlist_generation: 'cutlist-engine',
        mep_electrical: 'mep-calculator',
        mep_plumbing: 'mep-calculator',
        mep_hvac: 'mep-calculator',
      };

      const endpointMap: Record<string, string> = {
        design_generation: '/api/v1/designs/job',
        bom_calculation: '/api/v1/bom/job',
        drawing_generation: '/api/v1/drawings/job',
        cutlist_generation: '/api/v1/cutlist/job',
        mep_electrical: '/api/v1/mep/job',
        mep_plumbing: '/api/v1/mep/job',
        mep_hvac: '/api/v1/mep/job',
      };

      const serviceName = serviceMap[job.type];
      const endpoint = endpointMap[job.type];
      if (serviceName && endpoint) {
        const baseUrl = SERVICE_URLS[serviceName];
        if (baseUrl) {
          fetch(`${baseUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              job_id: job.id,
              design_variant_id: job.designVariantId,
              user_id: job.userId,
              ...(job.inputJson as Record<string, unknown>),
            }),
          }).catch(() => {});
        }
      }

      return { success: true };
    }),
});
