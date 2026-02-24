import { z } from 'zod';
import {
  projects, digitalTwins, iotDevices, iotDataPoints, emergencyReferences,
  eq, and,
} from '@openlintel/db';
import { router, protectedProcedure } from '../init';

// ── Helper: verify project ownership ────────────────────────────────────────
async function verifyProjectOwnership(
  db: Parameters<Parameters<typeof protectedProcedure.query>[0]>['ctx']['db'],
  projectId: string,
  userId: string,
) {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
  });
  if (!project) throw new Error('Project not found');
  return project;
}

export const digitalTwinRouter = router({
  // ── 1. createTwin ─────────────────────────────────────────────────────────
  createTwin: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwnership(ctx.db, input.projectId, ctx.userId);

      const [twin] = await ctx.db
        .insert(digitalTwins)
        .values({
          projectId: input.projectId,
          status: 'draft',
        })
        .returning();
      return twin;
    }),

  // ── 2. getTwin ────────────────────────────────────────────────────────────
  getTwin: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwnership(ctx.db, input.projectId, ctx.userId);

      const twin = await ctx.db.query.digitalTwins.findFirst({
        where: eq(digitalTwins.projectId, input.projectId),
        with: { iotDevices: true },
      });
      return twin ?? null;
    }),

  // ── 3. updateTwin ─────────────────────────────────────────────────────────
  updateTwin: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(['draft', 'active', 'archived']).optional(),
        modelStorageKey: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership via the twin's project
      const twin = await ctx.db.query.digitalTwins.findFirst({
        where: eq(digitalTwins.id, input.id),
        with: { project: true },
      });
      if (!twin || twin.project.userId !== ctx.userId) {
        throw new Error('Digital twin not found');
      }

      const { id, ...data } = input;
      const [updated] = await ctx.db
        .update(digitalTwins)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(digitalTwins.id, id))
        .returning();
      return updated;
    }),

  // ── 4. addDevice ──────────────────────────────────────────────────────────
  addDevice: protectedProcedure
    .input(
      z.object({
        digitalTwinId: z.string(),
        name: z.string().min(1),
        deviceType: z.enum(['temperature', 'humidity', 'motion', 'energy', 'water']),
        roomId: z.string().optional(),
        positionJson: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership via the twin's project
      const twin = await ctx.db.query.digitalTwins.findFirst({
        where: eq(digitalTwins.id, input.digitalTwinId),
        with: { project: true },
      });
      if (!twin || twin.project.userId !== ctx.userId) {
        throw new Error('Digital twin not found');
      }

      const [device] = await ctx.db
        .insert(iotDevices)
        .values({
          digitalTwinId: input.digitalTwinId,
          name: input.name,
          deviceType: input.deviceType,
          roomId: input.roomId,
          positionJson: input.positionJson,
          status: 'active',
        })
        .returning();
      return device;
    }),

  // ── 5. listDevices ────────────────────────────────────────────────────────
  listDevices: protectedProcedure
    .input(z.object({ digitalTwinId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify ownership via the twin's project
      const twin = await ctx.db.query.digitalTwins.findFirst({
        where: eq(digitalTwins.id, input.digitalTwinId),
        with: { project: true },
      });
      if (!twin || twin.project.userId !== ctx.userId) {
        throw new Error('Digital twin not found');
      }

      const devices = await ctx.db.query.iotDevices.findMany({
        where: eq(iotDevices.digitalTwinId, input.digitalTwinId),
        orderBy: (d, { asc }) => [asc(d.createdAt)],
      });

      // Attach the latest data point for each device
      const devicesWithLatest = await Promise.all(
        devices.map(async (device) => {
          const latestPoint = await ctx.db.query.iotDataPoints.findFirst({
            where: eq(iotDataPoints.deviceId, device.id),
            orderBy: (dp, { desc: d }) => [d(dp.timestamp)],
          });
          return { ...device, latestDataPoint: latestPoint ?? null };
        }),
      );

      return devicesWithLatest;
    }),

  // ── 6. removeDevice ───────────────────────────────────────────────────────
  removeDevice: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership via device -> twin -> project
      const device = await ctx.db.query.iotDevices.findFirst({
        where: eq(iotDevices.id, input.id),
        with: { digitalTwin: { with: { project: true } } },
      });
      if (!device || device.digitalTwin.project.userId !== ctx.userId) {
        throw new Error('Device not found');
      }

      await ctx.db.delete(iotDevices).where(eq(iotDevices.id, input.id));
      return { success: true };
    }),

  // ── 7. addDataPoint ───────────────────────────────────────────────────────
  addDataPoint: protectedProcedure
    .input(
      z.object({
        deviceId: z.string(),
        value: z.number(),
        unit: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership via device -> twin -> project
      const device = await ctx.db.query.iotDevices.findFirst({
        where: eq(iotDevices.id, input.deviceId),
        with: { digitalTwin: { with: { project: true } } },
      });
      if (!device || device.digitalTwin.project.userId !== ctx.userId) {
        throw new Error('Device not found');
      }

      const [dataPoint] = await ctx.db
        .insert(iotDataPoints)
        .values({
          deviceId: input.deviceId,
          value: input.value,
          unit: input.unit,
        })
        .returning();
      return dataPoint;
    }),

  // ── 8. getDeviceHistory ───────────────────────────────────────────────────
  getDeviceHistory: protectedProcedure
    .input(
      z.object({
        deviceId: z.string(),
        limit: z.number().int().positive().default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify ownership via device -> twin -> project
      const device = await ctx.db.query.iotDevices.findFirst({
        where: eq(iotDevices.id, input.deviceId),
        with: { digitalTwin: { with: { project: true } } },
      });
      if (!device || device.digitalTwin.project.userId !== ctx.userId) {
        throw new Error('Device not found');
      }

      return ctx.db.query.iotDataPoints.findMany({
        where: eq(iotDataPoints.deviceId, input.deviceId),
        orderBy: (dp, { desc: d }) => [d(dp.timestamp)],
        limit: input.limit,
      });
    }),

  // ── 9. addEmergencyRef ────────────────────────────────────────────────────
  addEmergencyRef: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        type: z.enum(['water_shutoff', 'gas_shutoff', 'electrical_breaker', 'fire_extinguisher']),
        label: z.string().min(1),
        description: z.string().optional(),
        locationDescription: z.string().optional(),
        positionJson: z.record(z.unknown()).optional(),
        roomId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwnership(ctx.db, input.projectId, ctx.userId);

      const [ref] = await ctx.db
        .insert(emergencyReferences)
        .values(input)
        .returning();
      return ref;
    }),

  // ── 10. listEmergencyRefs ─────────────────────────────────────────────────
  listEmergencyRefs: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwnership(ctx.db, input.projectId, ctx.userId);

      return ctx.db.query.emergencyReferences.findMany({
        where: eq(emergencyReferences.projectId, input.projectId),
        orderBy: (e, { asc }) => [asc(e.createdAt)],
      });
    }),

  // ── 11. removeEmergencyRef ────────────────────────────────────────────────
  removeEmergencyRef: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership via ref -> project
      const ref = await ctx.db.query.emergencyReferences.findFirst({
        where: eq(emergencyReferences.id, input.id),
        with: { project: true },
      });
      if (!ref || ref.project.userId !== ctx.userId) {
        throw new Error('Emergency reference not found');
      }

      await ctx.db
        .delete(emergencyReferences)
        .where(eq(emergencyReferences.id, input.id));
      return { success: true };
    }),

  // ── 12. getDashboard ──────────────────────────────────────────────────────
  getDashboard: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwnership(ctx.db, input.projectId, ctx.userId);

      // Find the digital twin for this project
      const twin = await ctx.db.query.digitalTwins.findFirst({
        where: eq(digitalTwins.projectId, input.projectId),
      });

      if (!twin) {
        return {
          twinId: null,
          twinStatus: null,
          deviceCount: 0,
          activeCount: 0,
          offlineCount: 0,
          maintenanceCount: 0,
          latestReadings: [],
        };
      }

      // Get all devices for this twin
      const devices = await ctx.db.query.iotDevices.findMany({
        where: eq(iotDevices.digitalTwinId, twin.id),
      });

      const activeCount = devices.filter((d) => d.status === 'active').length;
      const offlineCount = devices.filter((d) => d.status === 'offline').length;
      const maintenanceCount = devices.filter((d) => d.status === 'maintenance').length;

      // Group devices by type and get the latest reading for each type
      const deviceTypes = [...new Set(devices.map((d) => d.deviceType))];
      const latestReadings = await Promise.all(
        deviceTypes.map(async (deviceType) => {
          const devicesOfType = devices.filter((d) => d.deviceType === deviceType);
          // Get the most recent data point across all devices of this type
          let latestPoint = null;
          for (const device of devicesOfType) {
            const point = await ctx.db.query.iotDataPoints.findFirst({
              where: eq(iotDataPoints.deviceId, device.id),
              orderBy: (dp, { desc: d }) => [d(dp.timestamp)],
            });
            if (point && (!latestPoint || point.timestamp > latestPoint.timestamp)) {
              latestPoint = point;
            }
          }
          return {
            deviceType,
            deviceCount: devicesOfType.length,
            latestValue: latestPoint?.value ?? null,
            latestUnit: latestPoint?.unit ?? null,
            latestTimestamp: latestPoint?.timestamp ?? null,
          };
        }),
      );

      return {
        twinId: twin.id,
        twinStatus: twin.status,
        deviceCount: devices.length,
        activeCount,
        offlineCount,
        maintenanceCount,
        latestReadings,
      };
    }),
});
