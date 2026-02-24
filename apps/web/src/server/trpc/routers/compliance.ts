import { z } from 'zod';
import { projects, rooms, eq, and } from '@openlintel/db';
import { router, protectedProcedure } from '../init';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Building Code Rules ────────────────────────────────────────
interface BuildingCodeRule {
  code_id: string;
  jurisdiction: { country: string; state?: string; city?: string };
  category: string;
  rule: {
    description: string;
    requirement: string;
    min_value?: number;
    max_value?: number;
    unit?: string;
    applies_to?: string[];
  };
  source: {
    document: string;
    edition?: string;
    clause: string;
    url?: string;
  };
}

interface ComplianceResult {
  ruleId: string;
  category: string;
  status: 'pass' | 'fail' | 'warning' | 'not_applicable';
  description: string;
  requirement: string;
  actualValue?: number | string;
  requiredValue?: number | string;
  unit?: string;
  source: string;
  clause: string;
}

// All jurisdiction files to load
const JURISDICTION_FILES = [
  'india-nbc.json',
  'us-irc.json',
  'eu-eurocode.json',
  'uk-building-regs.json',
];

const JURISDICTIONS = [
  { code: 'IN', name: 'India (NBC 2016)' },
  { code: 'US', name: 'United States (IRC 2021)' },
  { code: 'EU', name: 'European Union (Eurocode)' },
  { code: 'GB', name: 'United Kingdom (Building Regs)' },
];

// Load rules from all jurisdiction files at module init
let ALL_RULES: BuildingCodeRule[] = [];
for (const file of JURISDICTION_FILES) {
  try {
    const rulesPath = join(process.cwd(), '..', '..', 'data', 'building-codes', file);
    const rules: BuildingCodeRule[] = JSON.parse(readFileSync(rulesPath, 'utf-8'));
    ALL_RULES = ALL_RULES.concat(rules);
  } catch {
    try {
      const rulesPath = join(process.cwd(), 'data', 'building-codes', file);
      const rules: BuildingCodeRule[] = JSON.parse(readFileSync(rulesPath, 'utf-8'));
      ALL_RULES = ALL_RULES.concat(rules);
    } catch {
      console.warn(`Building codes file ${file} not found, skipping`);
    }
  }
}

function checkRoomCompliance(
  room: { name: string; type: string; lengthMm: number | null; widthMm: number | null; heightMm: number | null },
  rules: BuildingCodeRule[],
): ComplianceResult[] {
  const results: ComplianceResult[] = [];
  const lengthMm = room.lengthMm || 0;
  const widthMm = room.widthMm || 0;
  const heightMm = room.heightMm || 2700;
  const areaSqm = (lengthMm * widthMm) / 1_000_000;
  const minDimensionMm = Math.min(lengthMm, widthMm);

  for (const rule of rules) {
    const appliesTo = rule.rule.applies_to || [];

    // Check if rule applies to this room type
    if (appliesTo.length > 0 && !appliesTo.includes(room.type)) {
      continue;
    }

    // Skip if room has no dimensions
    if (lengthMm === 0 || widthMm === 0) {
      results.push({
        ruleId: rule.code_id,
        category: rule.category,
        status: 'warning',
        description: rule.rule.description,
        requirement: rule.rule.requirement,
        actualValue: 'Unknown (no dimensions)',
        source: rule.source.document,
        clause: rule.source.clause,
      });
      continue;
    }

    if (rule.category === 'room_dimensions' && rule.rule.unit === 'sqm' && rule.rule.min_value) {
      // Area check
      results.push({
        ruleId: rule.code_id,
        category: rule.category,
        status: areaSqm >= rule.rule.min_value ? 'pass' : 'fail',
        description: rule.rule.description,
        requirement: rule.rule.requirement,
        actualValue: Math.round(areaSqm * 100) / 100,
        requiredValue: rule.rule.min_value,
        unit: 'sq.m',
        source: rule.source.document,
        clause: rule.source.clause,
      });
    } else if (rule.category === 'room_dimensions' && rule.rule.unit === 'mm') {
      if (rule.rule.description.toLowerCase().includes('width')) {
        // Width check
        results.push({
          ruleId: rule.code_id,
          category: rule.category,
          status: minDimensionMm >= (rule.rule.min_value || 0) ? 'pass' : 'fail',
          description: rule.rule.description,
          requirement: rule.rule.requirement,
          actualValue: minDimensionMm,
          requiredValue: rule.rule.min_value,
          unit: 'mm',
          source: rule.source.document,
          clause: rule.source.clause,
        });
      } else if (rule.rule.description.toLowerCase().includes('ceiling') || rule.rule.description.toLowerCase().includes('height')) {
        // Height check
        results.push({
          ruleId: rule.code_id,
          category: rule.category,
          status: heightMm >= (rule.rule.min_value || 0) ? 'pass' : 'fail',
          description: rule.rule.description,
          requirement: rule.rule.requirement,
          actualValue: heightMm,
          requiredValue: rule.rule.min_value,
          unit: 'mm',
          source: rule.source.document,
          clause: rule.source.clause,
        });
      }
    } else if (rule.category === 'ventilation' || rule.category === 'fire_safety' ||
               rule.category === 'electrical' || rule.category === 'plumbing' ||
               rule.category === 'accessibility') {
      // Informational rules — can't auto-verify without design data, mark as warning
      results.push({
        ruleId: rule.code_id,
        category: rule.category,
        status: 'warning',
        description: rule.rule.description,
        requirement: rule.rule.requirement,
        actualValue: 'Requires manual verification',
        source: rule.source.document,
        clause: rule.source.clause,
      });
    }
  }

  return results;
}

export const complianceRouter = router({
  // Check compliance for a single room
  checkRoom: protectedProcedure
    .input(z.object({
      roomId: z.string(),
      jurisdiction: z.string().default('IN'),
    }))
    .query(async ({ ctx, input }) => {
      const room = await ctx.db.query.rooms.findFirst({
        where: eq(rooms.id, input.roomId),
        with: { project: true },
      });
      if (!room) throw new Error('Room not found');
      if (room.project.userId !== ctx.userId) throw new Error('Access denied');

      const applicableRules = ALL_RULES.filter(
        (r) => r.jurisdiction.country === input.jurisdiction,
      );

      const results = checkRoomCompliance(
        {
          name: room.name,
          type: room.type,
          lengthMm: room.lengthMm,
          widthMm: room.widthMm,
          heightMm: room.heightMm,
        },
        applicableRules,
      );

      const passCount = results.filter((r) => r.status === 'pass').length;
      const failCount = results.filter((r) => r.status === 'fail').length;
      const warningCount = results.filter((r) => r.status === 'warning').length;

      return {
        roomId: room.id,
        roomName: room.name,
        roomType: room.type,
        jurisdiction: input.jurisdiction,
        results,
        summary: {
          total: results.length,
          pass: passCount,
          fail: failCount,
          warning: warningCount,
          complianceRate: (passCount + failCount) > 0
            ? Math.round((passCount / (passCount + failCount)) * 100)
            : 100,
        },
      };
    }),

  // Check compliance for all rooms in a project
  checkProject: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      jurisdiction: z.string().default('IN'),
    }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)),
        with: { rooms: true },
      });
      if (!project) throw new Error('Project not found');

      const applicableRules = ALL_RULES.filter(
        (r) => r.jurisdiction.country === input.jurisdiction,
      );

      const roomReports = project.rooms.map((room) => {
        const results = checkRoomCompliance(
          {
            name: room.name,
            type: room.type,
            lengthMm: room.lengthMm,
            widthMm: room.widthMm,
            heightMm: room.heightMm,
          },
          applicableRules,
        );

        const passCount = results.filter((r) => r.status === 'pass').length;
        const failCount = results.filter((r) => r.status === 'fail').length;

        return {
          roomId: room.id,
          roomName: room.name,
          roomType: room.type,
          results,
          passCount,
          failCount,
          warningCount: results.filter((r) => r.status === 'warning').length,
        };
      });

      const totalPass = roomReports.reduce((sum, r) => sum + r.passCount, 0);
      const totalFail = roomReports.reduce((sum, r) => sum + r.failCount, 0);
      const totalWarning = roomReports.reduce((sum, r) => sum + r.warningCount, 0);

      return {
        projectId: project.id,
        projectName: project.name,
        jurisdiction: input.jurisdiction,
        rooms: roomReports,
        summary: {
          totalRooms: project.rooms.length,
          totalChecks: totalPass + totalFail + totalWarning,
          pass: totalPass,
          fail: totalFail,
          warning: totalWarning,
          complianceRate: (totalPass + totalFail) > 0
            ? Math.round((totalPass / (totalPass + totalFail)) * 100)
            : 100,
        },
      };
    }),

  // List all available rules
  listRules: protectedProcedure
    .input(z.object({
      jurisdiction: z.string().default('IN'),
      category: z.string().optional(),
    }))
    .query(async ({ input }) => {
      let filtered = ALL_RULES.filter(
        (r) => r.jurisdiction.country === input.jurisdiction,
      );
      if (input.category) {
        filtered = filtered.filter((r) => r.category === input.category);
      }
      return filtered;
    }),

  // List available jurisdictions
  listJurisdictions: protectedProcedure
    .query(async () => {
      return JURISDICTIONS;
    }),
});
