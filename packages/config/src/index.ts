/**
 * @interiorai/config
 *
 * Shared configuration: ESLint configs, TypeScript configs, constants.
 */

export const APP_NAME = 'InteriorAI';
export const DEFAULT_UNIT_SYSTEM = 'metric' as const;
export const DEFAULT_CURRENCY = 'USD';

/** Standard sheet sizes for nesting optimization (in mm) */
export const STANDARD_SHEET_SIZES = {
  '8x4': { length: 2440, width: 1220 },
  '7x4': { length: 2135, width: 1220 },
  '6x4': { length: 1830, width: 1220 },
  '8x3': { length: 2440, width: 915 },
} as const;

/** Default waste factors by material category */
export const DEFAULT_WASTE_FACTORS = {
  tiles_straight: 0.05,
  tiles_diagonal: 0.10,
  tiles_herringbone: 0.12,
  paint: 0.03,
  plywood: 0.08,
  edge_banding: 0.10,
  wire: 0.15,
  pipe: 0.10,
} as const;

/** Minimum clearances in mm (ergonomic standards) */
export const MIN_CLEARANCES = {
  walkway: 915,
  sofa_to_coffee_table: 457,
  dining_chair_pullback: 915,
  kitchen_work_triangle_min: 1200,
  kitchen_work_triangle_max: 7900,
  door_swing: 915,
  wheelchair_turning: 1525,
} as const;
