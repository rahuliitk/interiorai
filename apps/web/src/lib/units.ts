/**
 * Unit conversion utilities for metric <-> imperial.
 */

const MM_PER_INCH = 25.4;
const SQM_PER_SQFT = 0.09290304;
const M_PER_FT = 0.3048;

export function mmToInches(mm: number): number {
  return mm / MM_PER_INCH;
}

export function inchesToMm(inches: number): number {
  return inches * MM_PER_INCH;
}

export function sqmToSqft(sqm: number): number {
  return sqm / SQM_PER_SQFT;
}

export function sqftToSqm(sqft: number): number {
  return sqft * SQM_PER_SQFT;
}

export function metersToFeet(m: number): number {
  return m / M_PER_FT;
}

export function feetToMeters(ft: number): number {
  return ft * M_PER_FT;
}

export type UnitSystem = 'metric' | 'imperial';

/**
 * Convert a dimension in mm to the display unit for the given system.
 */
export function formatDimension(mm: number, system: UnitSystem): string {
  if (system === 'imperial') {
    const inches = mmToInches(mm);
    const feet = Math.floor(inches / 12);
    const remainingInches = Math.round(inches % 12);
    return feet > 0
      ? `${feet}' ${remainingInches}"`
      : `${remainingInches}"`;
  }
  if (mm >= 1000) {
    return `${(mm / 1000).toFixed(2)} m`;
  }
  return `${Math.round(mm)} mm`;
}

/**
 * Convert an area in sq meters to the display unit for the given system.
 */
export function formatArea(sqm: number, system: UnitSystem): string {
  if (system === 'imperial') {
    return `${sqmToSqft(sqm).toFixed(1)} sq ft`;
  }
  return `${sqm.toFixed(2)} sq m`;
}
