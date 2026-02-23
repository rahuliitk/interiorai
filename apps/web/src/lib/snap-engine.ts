/**
 * Snap Engine — grid snapping, wall snapping, and object alignment utilities
 * for the 3D interactive editor.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BoundingBox {
  min: Vec3;
  max: Vec3;
}

/** Snap a value to the nearest grid increment. */
export function snapToGrid(value: number, gridSize: number): number {
  if (gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

/** Snap a 3D position to the grid on the XZ plane (Y stays unchanged). */
export function snapPositionToGrid(
  position: Vec3,
  gridSize: number,
): Vec3 {
  return {
    x: snapToGrid(position.x, gridSize),
    y: position.y,
    z: snapToGrid(position.z, gridSize),
  };
}

/** Convert millimetres to metres. */
export function mmToM(mm: number): number {
  return mm / 1000;
}

/** Convert metres to millimetres. */
export function mToMm(m: number): number {
  return m * 1000;
}

/**
 * Snap a position to the nearest wall if the object is within `threshold` metres.
 * Walls are defined by room dimensions (length along X, width along Z).
 * The room is centred at origin: walls run from -halfLength..+halfLength on X
 * and -halfWidth..+halfWidth on Z.
 */
export function snapToWall(
  position: Vec3,
  roomLengthM: number,
  roomWidthM: number,
  threshold: number = 0.15,
): Vec3 {
  const halfL = roomLengthM / 2;
  const halfW = roomWidthM / 2;

  let { x, y, z } = position;

  // Snap to X walls
  if (Math.abs(x - halfL) < threshold) x = halfL;
  else if (Math.abs(x + halfL) < threshold) x = -halfL;

  // Snap to Z walls
  if (Math.abs(z - halfW) < threshold) z = halfW;
  else if (Math.abs(z + halfW) < threshold) z = -halfW;

  return { x, y, z };
}

/**
 * Align an object to another object on a given axis if within threshold.
 * Returns the adjusted position for the moving object.
 */
export function alignToObject(
  movingPos: Vec3,
  targetPos: Vec3,
  axis: 'x' | 'z',
  threshold: number = 0.1,
): Vec3 {
  const diff = Math.abs(movingPos[axis] - targetPos[axis]);
  if (diff < threshold) {
    return { ...movingPos, [axis]: targetPos[axis] };
  }
  return movingPos;
}

/**
 * Check whether two bounding boxes overlap on the XZ plane.
 */
export function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.min.x < b.max.x && a.max.x > b.min.x && a.min.z < b.max.z && a.max.z > b.min.z;
}

/**
 * Clamp a position to stay within the room boundaries.
 */
export function clampToRoom(
  position: Vec3,
  roomLengthM: number,
  roomWidthM: number,
  objectHalfWidth: number = 0,
  objectHalfDepth: number = 0,
): Vec3 {
  const halfL = roomLengthM / 2;
  const halfW = roomWidthM / 2;

  return {
    x: Math.max(-halfL + objectHalfWidth, Math.min(halfL - objectHalfWidth, position.x)),
    y: position.y,
    z: Math.max(-halfW + objectHalfDepth, Math.min(halfW - objectHalfDepth, position.z)),
  };
}

/** Available grid sizes in metres (converted from mm labels). */
export const GRID_SIZES = [
  { label: '50 mm', value: 0.05 },
  { label: '100 mm', value: 0.1 },
  { label: '250 mm', value: 0.25 },
] as const;

export type GridSizeValue = (typeof GRID_SIZES)[number]['value'];
