// =============================================================================
// Core Domain Types for OpenLintel
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
  renderUrls?: string[];
  promptUsed?: string;
  constraints?: string[];
  jobId?: string;
  sourceUploadId?: string;
  metadata?: Record<string, unknown>;
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

// =============================================================================
// Job / Async Processing Types
// =============================================================================

export type JobType =
  | 'design_generation'
  | 'bom_calculation'
  | 'drawing_generation'
  | 'cutlist_generation'
  | 'mep_electrical'
  | 'mep_plumbing'
  | 'mep_hvac'
  | 'schedule_generation'
  | 'room_segmentation'
  | 'floor_plan_digitization';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  userId: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  error?: string;
  inputJson?: Record<string, unknown>;
  outputJson?: Record<string, unknown>;
  createdAt: string;
  completedAt?: string;
}

// =============================================================================
// Drawing Types
// =============================================================================

export type DrawingType =
  | 'floor_plan'
  | 'furnished_plan'
  | 'elevation'
  | 'section'
  | 'rcp'
  | 'flooring_layout'
  | 'electrical_layout';

export interface DrawingResult {
  id: string;
  designVariantId: string;
  drawingType: DrawingType;
  dxfStorageKey?: string;
  pdfStorageKey?: string;
  svgStorageKey?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// =============================================================================
// MEP Types
// =============================================================================

export type MEPCalcType = 'electrical' | 'plumbing' | 'hvac';

export interface CircuitSchedule {
  circuits: {
    number: number;
    description: string;
    breakerSize: number;
    wireGauge: string;
    load_watts: number;
    type: 'lighting' | 'power' | 'dedicated';
  }[];
  totalLoad_watts: number;
  mainBreakerSize: number;
  standard: string;
}

export interface FixtureUnitCalc {
  fixtures: {
    name: string;
    count: number;
    fixtureUnits: number;
    totalUnits: number;
  }[];
  totalFixtureUnits: number;
  recommendedPipeSize_mm: number;
  standard: string;
}

export interface CoolingLoad {
  sensibleLoad_btu: number;
  latentLoad_btu: number;
  totalLoad_btu: number;
  tonnage: number;
  recommendedEquipment: string;
  standard: string;
}

// =============================================================================
// Schedule / Timeline Types
// =============================================================================

export type TradeType =
  | 'demolition'
  | 'civil'
  | 'plumbing_rough_in'
  | 'electrical_rough_in'
  | 'false_ceiling'
  | 'flooring'
  | 'carpentry'
  | 'painting'
  | 'mep_fixtures'
  | 'soft_furnishing'
  | 'cleanup';

export interface ScheduleTask {
  id: string;
  name: string;
  trade: TradeType;
  startDay: number;
  durationDays: number;
  dependencies: string[];
  isCritical?: boolean;
}

export interface Milestone {
  id: string;
  name: string;
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  paymentLinked: boolean;
}

// =============================================================================
// Nesting / Sheet Layout Types
// =============================================================================

export interface NestingResult {
  sheets: SheetLayout[];
  totalSheets: number;
  wastePercent: number;
}

export interface SheetLayout {
  sheetSize: string; // e.g. '8x4'
  length_mm: number;
  width_mm: number;
  panels: PlacedPanel[];
  wastePercent: number;
}

export interface PlacedPanel {
  panelId: string;
  partName: string;
  x: number;
  y: number;
  length_mm: number;
  width_mm: number;
  rotated: boolean;
}

// =============================================================================
// Contractor / Marketplace Types
// =============================================================================

export interface Contractor {
  id: string;
  name: string;
  companyName?: string;
  specializations: string[];
  city?: string;
  rating: number;
  totalReviews: number;
  verified: boolean;
}

export interface ContractorReview {
  id: string;
  contractorId: string;
  userId: string;
  rating: number;
  title?: string;
  review?: string;
  createdAt: string;
}

// =============================================================================
// Collaboration Types
// =============================================================================

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'revision_requested';

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message?: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

// =============================================================================
// Product Catalogue Types
// =============================================================================

export interface Product {
  id: string;
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  vendorId?: string;
  sku?: string;
  imageUrl?: string;
  specifications?: Record<string, unknown>;
  dimensions?: Dimensions;
  weight_kg?: number;
}

export interface Vendor {
  id: string;
  name: string;
  website?: string;
  contactEmail?: string;
  rating?: number;
}

// =============================================================================
// Segmentation / Floor Plan Types
// =============================================================================

export interface SegmentationResult {
  objects: DetectedObject[];
  depthMap?: string; // storage key for depth map image
}

export interface DetectedObject {
  label: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  maskKey?: string;
}

export interface FloorPlanData {
  rooms: RoomPolygon[];
  doors: DoorWindow[];
  windows: DoorWindow[];
  dimensions: { start: [number, number]; end: [number, number]; value_mm: number }[];
}

export interface RoomPolygon {
  name: string;
  type: RoomType;
  vertices: [number, number][];
  area_sqm: number;
}

export interface DoorWindow {
  type: 'door' | 'window';
  position: [number, number];
  width_mm: number;
  height_mm?: number;
  wallId?: string;
}
