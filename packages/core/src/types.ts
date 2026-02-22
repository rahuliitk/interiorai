// =============================================================================
// Core Domain Types for InteriorAI
// =============================================================================

/** Supported unit systems */
export type UnitSystem = 'metric' | 'imperial';

/** Dimensions in millimeters (internal canonical unit) */
export interface Dimensions {
  length_mm: number;
  width_mm: number;
  height_mm: number;
}

/** A physical room in a project */
export interface Room {
  id: string;
  name: string;
  type: RoomType;
  dimensions: Dimensions;
  floor: number;
}

export type RoomType =
  | 'living_room'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'dining'
  | 'study'
  | 'balcony'
  | 'utility'
  | 'foyer'
  | 'corridor'
  | 'pooja_room'
  | 'store'
  | 'garage'
  | 'terrace'
  | 'other';

/** Design variant for a room */
export interface DesignVariant {
  id: string;
  roomId: string;
  name: string;
  style: DesignStyle;
  budgetTier: BudgetTier;
  renderUrl?: string;
  createdAt: string;
}

export type DesignStyle =
  | 'modern'
  | 'contemporary'
  | 'minimalist'
  | 'scandinavian'
  | 'industrial'
  | 'traditional'
  | 'transitional'
  | 'bohemian'
  | 'mid_century'
  | 'art_deco'
  | 'japandi'
  | 'rustic'
  | 'coastal';

export type BudgetTier = 'economy' | 'mid_range' | 'premium' | 'luxury';

/** A single item in the Bill of Materials */
export interface BOMItem {
  id: string;
  roomId: string;
  category: MaterialCategory;
  name: string;
  specification: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  currency?: string;
  wasteFactor: number;
}

export type MaterialCategory =
  | 'civil'
  | 'flooring'
  | 'painting'
  | 'electrical'
  | 'plumbing'
  | 'carpentry'
  | 'false_ceiling'
  | 'glass_aluminum'
  | 'sanitaryware'
  | 'appliances'
  | 'soft_furnishing'
  | 'decor'
  | 'hardware';

/** Panel cut list entry for CNC manufacturing */
export interface CutListPanel {
  id: string;
  furnitureUnitId: string;
  partName: string;
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  material: PanelMaterial;
  grainDirection: 'length' | 'width' | 'none';
  faceLaminate?: string;
  edgeBanding: {
    top: boolean;
    bottom: boolean;
    left: boolean;
    right: boolean;
    material?: string;
    thickness_mm?: number;
  };
  quantity: number;
}

export type PanelMaterial =
  | 'bwr_plywood'
  | 'mr_plywood'
  | 'mdf'
  | 'particle_board'
  | 'hdhmr'
  | 'solid_wood'
  | 'marine_plywood';

/** Project status through its lifecycle */
export type ProjectStatus =
  | 'draft'
  | 'designing'
  | 'design_approved'
  | 'procurement'
  | 'in_construction'
  | 'punch_list'
  | 'completed'
  | 'maintenance';

/** A full project */
export interface Project {
  id: string;
  name: string;
  ownerId: string;
  status: ProjectStatus;
  rooms: Room[];
  unitSystem: UnitSystem;
  createdAt: string;
  updatedAt: string;
}
