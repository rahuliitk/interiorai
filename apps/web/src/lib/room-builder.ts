/**
 * Room Builder — generates Three.js-compatible geometry data from room dimensions.
 * All room dimensions come in millimetres from the DB and are converted to metres here.
 */

import { mmToM } from './snap-engine';

export interface RoomDimensions {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

export interface WallOpening {
  type: 'door' | 'window';
  /** Wall the opening is on: 'north' | 'south' | 'east' | 'west' */
  wall: 'north' | 'south' | 'east' | 'west';
  /** Position along the wall from the left edge, in mm */
  positionMm: number;
  /** Width of the opening, in mm */
  widthMm: number;
  /** Height of the opening, in mm */
  heightMm: number;
  /** Distance from the floor, in mm (0 for doors) */
  sillHeightMm: number;
}

export interface WallSegment {
  /** Position of the wall centre in metres [x, y, z] */
  position: [number, number, number];
  /** Size of the wall panel in metres [width, height, depth] */
  size: [number, number, number];
  /** Rotation in radians around Y */
  rotationY: number;
}

export interface RoomGeometryData {
  /** Room dimensions in metres */
  lengthM: number;
  widthM: number;
  heightM: number;
  /** Floor plane */
  floor: {
    position: [number, number, number];
    size: [number, number];
  };
  /** Ceiling plane */
  ceiling: {
    position: [number, number, number];
    size: [number, number];
  };
  /** Wall segments (may include gaps for openings) */
  walls: WallSegment[];
}

const WALL_THICKNESS = 0.1; // 100mm thick walls

/**
 * Build wall segments for a single wall, optionally splitting around openings.
 */
function buildWallWithOpenings(
  wallDirection: 'north' | 'south' | 'east' | 'west',
  wallLengthM: number,
  wallHeightM: number,
  wallCenterPos: [number, number, number],
  rotationY: number,
  openings: WallOpening[],
): WallSegment[] {
  const relevantOpenings = openings
    .filter((o) => o.wall === wallDirection)
    .sort((a, b) => a.positionMm - b.positionMm);

  if (relevantOpenings.length === 0) {
    return [
      {
        position: wallCenterPos,
        size: [wallLengthM, wallHeightM, WALL_THICKNESS],
        rotationY,
      },
    ];
  }

  const segments: WallSegment[] = [];
  let cursor = 0; // position along the wall in metres from the left edge

  for (const opening of relevantOpenings) {
    const openingStartM = mmToM(opening.positionMm);
    const openingWidthM = mmToM(opening.widthMm);
    const openingHeightM = mmToM(opening.heightMm);
    const sillM = mmToM(opening.sillHeightMm);

    // Segment before the opening
    if (openingStartM > cursor) {
      const segWidth = openingStartM - cursor;
      const offsetAlongWall = cursor + segWidth / 2 - wallLengthM / 2;
      segments.push({
        position: offsetPosition(wallCenterPos, offsetAlongWall, rotationY, 0),
        size: [segWidth, wallHeightM, WALL_THICKNESS],
        rotationY,
      });
    }

    // Segment above the opening (lintel)
    const topOfOpening = sillM + openingHeightM;
    if (topOfOpening < wallHeightM) {
      const lintelHeight = wallHeightM - topOfOpening;
      const offsetAlongWall = openingStartM + openingWidthM / 2 - wallLengthM / 2;
      segments.push({
        position: offsetPosition(
          wallCenterPos,
          offsetAlongWall,
          rotationY,
          topOfOpening + lintelHeight / 2 - wallHeightM / 2,
        ),
        size: [openingWidthM, lintelHeight, WALL_THICKNESS],
        rotationY,
      });
    }

    // Segment below the opening (sill wall, for windows)
    if (sillM > 0) {
      const offsetAlongWall = openingStartM + openingWidthM / 2 - wallLengthM / 2;
      segments.push({
        position: offsetPosition(
          wallCenterPos,
          offsetAlongWall,
          rotationY,
          sillM / 2 - wallHeightM / 2,
        ),
        size: [openingWidthM, sillM, WALL_THICKNESS],
        rotationY,
      });
    }

    cursor = openingStartM + openingWidthM;
  }

  // Segment after the last opening
  if (cursor < wallLengthM) {
    const segWidth = wallLengthM - cursor;
    const offsetAlongWall = cursor + segWidth / 2 - wallLengthM / 2;
    segments.push({
      position: offsetPosition(wallCenterPos, offsetAlongWall, rotationY, 0),
      size: [segWidth, wallHeightM, WALL_THICKNESS],
      rotationY,
    });
  }

  return segments;
}

/**
 * Offset a wall-centre position along the wall and vertically.
 */
function offsetPosition(
  base: [number, number, number],
  alongWall: number,
  rotationY: number,
  verticalOffset: number,
): [number, number, number] {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return [
    base[0] + alongWall * cos,
    base[1] + verticalOffset,
    base[2] + alongWall * sin,
  ];
}

/**
 * Build the full room geometry from dimensions and optional openings.
 */
export function buildRoomGeometry(
  dimensions: RoomDimensions,
  openings: WallOpening[] = [],
): RoomGeometryData {
  const lengthM = mmToM(dimensions.lengthMm);
  const widthM = mmToM(dimensions.widthMm);
  const heightM = mmToM(dimensions.heightMm);
  const halfL = lengthM / 2;
  const halfW = widthM / 2;
  const halfH = heightM / 2;

  const walls: WallSegment[] = [];

  // North wall (far side, +Z face looking from inside)
  walls.push(
    ...buildWallWithOpenings(
      'north',
      lengthM,
      heightM,
      [0, halfH, halfW],
      0,
      openings,
    ),
  );

  // South wall (near side, -Z)
  walls.push(
    ...buildWallWithOpenings(
      'south',
      lengthM,
      heightM,
      [0, halfH, -halfW],
      0,
      openings,
    ),
  );

  // East wall (+X side)
  walls.push(
    ...buildWallWithOpenings(
      'east',
      widthM,
      heightM,
      [halfL, halfH, 0],
      Math.PI / 2,
      openings,
    ),
  );

  // West wall (-X side)
  walls.push(
    ...buildWallWithOpenings(
      'west',
      widthM,
      heightM,
      [-halfL, halfH, 0],
      Math.PI / 2,
      openings,
    ),
  );

  return {
    lengthM,
    widthM,
    heightM,
    floor: {
      position: [0, 0, 0],
      size: [lengthM, widthM],
    },
    ceiling: {
      position: [0, heightM, 0],
      size: [lengthM, widthM],
    },
    walls,
  };
}

/**
 * Default room dimensions if none provided (3m x 4m x 2.8m).
 */
export const DEFAULT_ROOM: RoomDimensions = {
  lengthMm: 4000,
  widthMm: 3000,
  heightMm: 2800,
};
