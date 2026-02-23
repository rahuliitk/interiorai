/**
 * GLTF model loading utilities and default furniture primitives.
 *
 * In production, useGLTF from @react-three/drei handles actual GLTF loading.
 * This module provides a model cache, URL management, and fallback primitive
 * definitions for when models are unavailable.
 */

export interface FurniturePrimitive {
  name: string;
  category: string;
  /** Dimensions in metres [width, height, depth] */
  size: [number, number, number];
  /** Default colour for the placeholder box */
  color: string;
  /** Optional GLTF model URL */
  modelUrl?: string;
}

/** Default furniture catalogue with placeholder primitives. */
export const FURNITURE_CATALOGUE: FurniturePrimitive[] = [
  // Living room
  { name: 'Sofa (3 Seater)', category: 'Living Room', size: [2.0, 0.85, 0.9], color: '#8B7355' },
  { name: 'Armchair', category: 'Living Room', size: [0.85, 0.85, 0.85], color: '#A0522D' },
  { name: 'Coffee Table', category: 'Living Room', size: [1.2, 0.45, 0.6], color: '#D2B48C' },
  { name: 'TV Unit', category: 'Living Room', size: [1.8, 0.5, 0.4], color: '#4A4A4A' },
  { name: 'Bookshelf', category: 'Living Room', size: [0.8, 2.0, 0.35], color: '#8B4513' },
  { name: 'Floor Lamp', category: 'Living Room', size: [0.3, 1.6, 0.3], color: '#C0C0C0' },

  // Bedroom
  { name: 'Double Bed', category: 'Bedroom', size: [1.6, 0.5, 2.0], color: '#DEB887' },
  { name: 'Single Bed', category: 'Bedroom', size: [1.0, 0.5, 2.0], color: '#DEB887' },
  { name: 'Wardrobe', category: 'Bedroom', size: [1.8, 2.2, 0.6], color: '#8B4513' },
  { name: 'Bedside Table', category: 'Bedroom', size: [0.5, 0.55, 0.4], color: '#D2B48C' },
  { name: 'Dresser', category: 'Bedroom', size: [1.2, 0.8, 0.45], color: '#A0522D' },
  { name: 'Study Table', category: 'Bedroom', size: [1.2, 0.75, 0.6], color: '#CD853F' },

  // Kitchen
  { name: 'Kitchen Island', category: 'Kitchen', size: [1.5, 0.9, 0.7], color: '#696969' },
  { name: 'Dining Table (4 Seater)', category: 'Kitchen', size: [1.2, 0.75, 0.8], color: '#8B4513' },
  { name: 'Dining Table (6 Seater)', category: 'Kitchen', size: [1.8, 0.75, 0.9], color: '#8B4513' },
  { name: 'Dining Chair', category: 'Kitchen', size: [0.45, 0.9, 0.5], color: '#A0522D' },
  { name: 'Bar Stool', category: 'Kitchen', size: [0.4, 0.75, 0.4], color: '#2F4F4F' },

  // Bathroom
  { name: 'Bathtub', category: 'Bathroom', size: [1.7, 0.6, 0.75], color: '#F5F5F5' },
  { name: 'Vanity Unit', category: 'Bathroom', size: [1.0, 0.85, 0.5], color: '#DCDCDC' },
  { name: 'Toilet', category: 'Bathroom', size: [0.4, 0.45, 0.65], color: '#F5F5F5' },

  // Office
  { name: 'Office Desk', category: 'Office', size: [1.4, 0.75, 0.7], color: '#4A4A4A' },
  { name: 'Office Chair', category: 'Office', size: [0.6, 1.1, 0.6], color: '#2F4F4F' },
  { name: 'Filing Cabinet', category: 'Office', size: [0.4, 0.7, 0.5], color: '#808080' },

  // General
  { name: 'Potted Plant', category: 'Decor', size: [0.4, 1.0, 0.4], color: '#228B22' },
  { name: 'Rug (Large)', category: 'Decor', size: [2.5, 0.02, 1.8], color: '#B22222' },
  { name: 'Rug (Small)', category: 'Decor', size: [1.5, 0.02, 1.0], color: '#4169E1' },
  { name: 'Ceiling Fan', category: 'Decor', size: [1.2, 0.3, 1.2], color: '#C0C0C0' },
];

/** Group catalogue items by category. */
export function getCatalogueByCategory(): Record<string, FurniturePrimitive[]> {
  const grouped: Record<string, FurniturePrimitive[]> = {};
  for (const item of FURNITURE_CATALOGUE) {
    if (!grouped[item.category]) {
      grouped[item.category] = [];
    }
    grouped[item.category].push(item);
  }
  return grouped;
}

/** In-memory cache for model URLs. */
const modelCache = new Map<string, boolean>();

/** Mark a model URL as loaded in the cache. */
export function cacheModel(url: string): void {
  modelCache.set(url, true);
}

/** Check whether a model is already cached. */
export function isModelCached(url: string): boolean {
  return modelCache.has(url);
}

/** Clear the model cache. */
export function clearModelCache(): void {
  modelCache.clear();
}

/**
 * Generate a unique ID for placed furniture.
 */
export function generateFurnitureId(): string {
  return `furniture_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * A placed furniture item in the scene.
 */
export interface PlacedFurniture {
  id: string;
  name: string;
  category: string;
  size: [number, number, number];
  color: string;
  modelUrl?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

/**
 * Create a new placed furniture instance from a catalogue primitive.
 */
export function createPlacedFurniture(
  primitive: FurniturePrimitive,
  position: [number, number, number] = [0, 0, 0],
): PlacedFurniture {
  return {
    id: generateFurnitureId(),
    name: primitive.name,
    category: primitive.category,
    size: [...primitive.size],
    color: primitive.color,
    modelUrl: primitive.modelUrl,
    position,
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}
