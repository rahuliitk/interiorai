import { pgTable, text, timestamp, integer, jsonb, real, boolean, vector, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './auth';

/**
 * Application domain tables.
 */

// ---------------------------------------------------------------------------
// User API Keys — encrypted LLM provider keys
// ---------------------------------------------------------------------------
export const userApiKeys = pgTable('user_api_keys', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // e.g. 'openai', 'anthropic', 'google'
  label: text('label').notNull(), // user-friendly name
  encryptedKey: text('encrypted_key').notNull(), // AES-256-GCM encrypted
  keyPrefix: text('key_prefix').notNull(), // e.g. 'sk-ab...' for display
  iv: text('iv').notNull(), // initialization vector (hex)
  authTag: text('auth_tag').notNull(), // GCM auth tag (hex)
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at', { mode: 'date' }),
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export const projects = pgTable('projects', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: text('status').notNull().default('draft'),
  address: text('address'),
  unitSystem: text('unit_system').notNull().default('metric'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------
export const rooms = pgTable('rooms', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull().default('other'),
  lengthMm: real('length_mm'),
  widthMm: real('width_mm'),
  heightMm: real('height_mm').default(2700), // standard ceiling height
  floor: integer('floor').default(0),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Design Variants
// ---------------------------------------------------------------------------
export const designVariants = pgTable('design_variants', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  roomId: text('room_id')
    .notNull()
    .references(() => rooms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  style: text('style').notNull(),
  budgetTier: text('budget_tier').notNull(),
  renderUrl: text('render_url'),
  specJson: jsonb('spec_json'), // full design specification
  // Batch 2: design generation fields
  sourceUploadId: text('source_upload_id').references(() => uploads.id, { onDelete: 'set null' }),
  promptUsed: text('prompt_used'),
  constraints: jsonb('constraints'), // string[] of user constraints
  jobId: text('job_id'), // references jobs.id (can't circular ref, handled in app)
  renderUrls: jsonb('render_urls'), // string[] of generated image URLs
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------
export const uploads = pgTable('uploads', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  roomId: text('room_id').references(() => rooms.id, { onDelete: 'set null' }),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  storageKey: text('storage_key').notNull(), // path in MinIO/S3
  category: text('category').notNull().default('photo'), // photo, floor_plan, document
  thumbnailKey: text('thumbnail_key'),
  imageHash: text('image_hash'), // perceptual hash for dedup
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Jobs — async processing queue for all services
// ---------------------------------------------------------------------------
export const jobs = pgTable('jobs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // design_generation, bom_calculation, drawing, segmentation, etc.
  status: text('status').notNull().default('pending'), // pending, running, completed, failed, cancelled
  inputJson: jsonb('input_json'),
  outputJson: jsonb('output_json'),
  error: text('error'),
  progress: integer('progress').default(0), // 0-100
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  roomId: text('room_id').references(() => rooms.id, { onDelete: 'set null' }),
  designVariantId: text('design_variant_id').references(() => designVariants.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  startedAt: timestamp('started_at', { mode: 'date' }),
  completedAt: timestamp('completed_at', { mode: 'date' }),
});

// ---------------------------------------------------------------------------
// BOM Results — Bill of Materials output
// ---------------------------------------------------------------------------
export const bomResults = pgTable('bom_results', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  designVariantId: text('design_variant_id')
    .notNull()
    .references(() => designVariants.id, { onDelete: 'cascade' }),
  jobId: text('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  items: jsonb('items').notNull(), // BOMItem[]
  totalCost: real('total_cost'),
  currency: text('currency').default('USD'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Drawing Results
// ---------------------------------------------------------------------------
export const drawingResults = pgTable('drawing_results', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  designVariantId: text('design_variant_id')
    .notNull()
    .references(() => designVariants.id, { onDelete: 'cascade' }),
  jobId: text('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  drawingType: text('drawing_type').notNull(), // floor_plan, elevation, section, rcp, flooring, electrical
  dxfStorageKey: text('dxf_storage_key'),
  pdfStorageKey: text('pdf_storage_key'),
  svgStorageKey: text('svg_storage_key'),
  ifcStorageKey: text('ifc_storage_key'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Cut List Results
// ---------------------------------------------------------------------------
export const cutlistResults = pgTable('cutlist_results', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  designVariantId: text('design_variant_id')
    .notNull()
    .references(() => designVariants.id, { onDelete: 'cascade' }),
  jobId: text('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  panels: jsonb('panels').notNull(), // CutListPanel[]
  hardware: jsonb('hardware'), // hardware schedule
  nestingResult: jsonb('nesting_result'), // sheet layouts
  totalSheets: integer('total_sheets'),
  wastePercent: real('waste_percent'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// MEP Calculations
// ---------------------------------------------------------------------------
export const mepCalculations = pgTable('mep_calculations', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  designVariantId: text('design_variant_id')
    .notNull()
    .references(() => designVariants.id, { onDelete: 'cascade' }),
  jobId: text('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  calcType: text('calc_type').notNull(), // electrical, plumbing, hvac
  result: jsonb('result').notNull(),
  standardsCited: jsonb('standards_cited'), // NEC/IPC/ASHRAE references
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Categories — hierarchical product categories
// ---------------------------------------------------------------------------
export const categories = pgTable('categories', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  parentId: text('parent_id'), // self-reference for hierarchy
  icon: text('icon'),
  imageUrl: text('image_url'),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  productCount: integer('product_count').default(0),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------
export const vendors = pgTable('vendors', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  code: text('code').unique(),
  description: text('description'),
  website: text('website'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  phone: text('phone'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  country: text('country').default('IN'),
  gstNumber: text('gst_number'),
  paymentTerms: text('payment_terms'),
  rating: real('rating'),
  isActive: boolean('is_active').default(true),
  productCount: integer('product_count').default(0),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Products Catalogue (pgvector for visual similarity)
// ---------------------------------------------------------------------------
export const products = pgTable('products', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  description: text('description'),
  brand: text('brand'),
  category: text('category').notNull(),
  categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
  subcategory: text('subcategory'),
  vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
  sku: text('sku'),
  status: text('status').notNull().default('active'),
  unit: text('unit').default('piece'),
  imageUrl: text('image_url'),
  imageStorageKey: text('image_storage_key'),
  images: jsonb('images'), // string[] of image URLs
  tags: jsonb('tags'), // string[]
  specifications: jsonb('specifications'),
  dimensions: jsonb('dimensions'), // { length_mm, width_mm, height_mm }
  weight_kg: real('weight_kg'),
  material: text('material'),
  finish: text('finish'),
  color: text('color'),
  prices: jsonb('prices'), // vendor price entries
  minPrice: real('min_price'),
  maxPrice: real('max_price'),
  embedding: text('embedding'), // stored as text, cast to vector in queries
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Product Embeddings — separate table for vector search
// ---------------------------------------------------------------------------
export const productEmbeddings = pgTable('product_embeddings', {
  productId: text('product_id')
    .primaryKey()
    .references(() => products.id, { onDelete: 'cascade' }),
  embedding: text('embedding'), // stored as text, cast to vector in queries
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const productPrices = pgTable('product_prices', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  vendorId: text('vendor_id')
    .notNull()
    .references(() => vendors.id, { onDelete: 'cascade' }),
  price: real('price').notNull(),
  currency: text('currency').notNull().default('USD'),
  unit: text('unit').default('piece'),
  validFrom: timestamp('valid_from', { mode: 'date' }).defaultNow().notNull(),
  validTo: timestamp('valid_to', { mode: 'date' }),
});

// ---------------------------------------------------------------------------
// Schedules + Milestones + Site Logs + Change Orders
// ---------------------------------------------------------------------------
export const schedules = pgTable('schedules', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  jobId: text('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  tasks: jsonb('tasks').notNull(), // ScheduleTask[] with dependencies
  criticalPath: jsonb('critical_path'), // task IDs on critical path
  startDate: timestamp('start_date', { mode: 'date' }),
  endDate: timestamp('end_date', { mode: 'date' }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const milestones = pgTable('milestones', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  scheduleId: text('schedule_id')
    .notNull()
    .references(() => schedules.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  dueDate: timestamp('due_date', { mode: 'date' }),
  completedDate: timestamp('completed_date', { mode: 'date' }),
  status: text('status').notNull().default('pending'), // pending, in_progress, completed, overdue
  paymentLinked: boolean('payment_linked').default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const siteLogs = pgTable('site_logs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  date: timestamp('date', { mode: 'date' }).notNull(),
  title: text('title').notNull(),
  notes: text('notes'),
  weather: text('weather'),
  workersOnSite: integer('workers_on_site'),
  photoKeys: jsonb('photo_keys'), // string[] of storage keys
  tags: jsonb('tags'), // string[]
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const changeOrders = pgTable('change_orders', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('proposed'), // proposed, approved, rejected, implemented
  costImpact: real('cost_impact'),
  timeImpactDays: integer('time_impact_days'),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Purchase Orders + Payments + Invoices
// ---------------------------------------------------------------------------
export const purchaseOrders = pgTable('purchase_orders', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('draft'), // draft, submitted, confirmed, shipped, delivered, cancelled
  items: jsonb('items').notNull(), // { productId, quantity, unitPrice }[]
  totalAmount: real('total_amount'),
  currency: text('currency').default('USD'),
  expectedDelivery: timestamp('expected_delivery', { mode: 'date' }),
  actualDelivery: timestamp('actual_delivery', { mode: 'date' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const payments = pgTable('payments', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  milestoneId: text('milestone_id').references(() => milestones.id, { onDelete: 'set null' }),
  amount: real('amount').notNull(),
  currency: text('currency').notNull().default('USD'),
  status: text('status').notNull().default('pending'), // pending, processing, completed, failed, refunded
  paymentProvider: text('payment_provider'), // stripe, razorpay
  externalId: text('external_id'), // Stripe/Razorpay payment ID
  metadata: jsonb('metadata'),
  paidAt: timestamp('paid_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const invoices = pgTable('invoices', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  purchaseOrderId: text('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'set null' }),
  invoiceNumber: text('invoice_number').notNull(),
  amount: real('amount').notNull(),
  currency: text('currency').default('USD'),
  status: text('status').notNull().default('draft'), // draft, sent, paid, overdue, cancelled
  dueDate: timestamp('due_date', { mode: 'date' }),
  paidDate: timestamp('paid_date', { mode: 'date' }),
  pdfStorageKey: text('pdf_storage_key'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Collaboration — Comments, Approvals, Notifications
// ---------------------------------------------------------------------------
export const comments = pgTable('comments', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  parentId: text('parent_id'), // self-reference for threading
  targetType: text('target_type').notNull(), // design_variant, room, drawing, bom
  targetId: text('target_id').notNull(),
  content: text('content').notNull(),
  resolved: boolean('resolved').default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const approvals = pgTable('approvals', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  requestedBy: text('requested_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  targetType: text('target_type').notNull(), // design_variant, bom, schedule
  targetId: text('target_id').notNull(),
  status: text('status').notNull().default('pending'), // pending, approved, rejected, revision_requested
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { mode: 'date' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // comment, approval, job_complete, payment, delivery
  title: text('title').notNull(),
  message: text('message'),
  link: text('link'), // relative URL to navigate to
  read: boolean('read').default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Contractors + Reviews + Assignments (Marketplace)
// ---------------------------------------------------------------------------
export const contractors = pgTable('contractors', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }), // optional linked user account
  name: text('name').notNull(),
  companyName: text('company_name'),
  bio: text('bio'), // short description / about
  website: text('website'),
  profileImageUrl: text('profile_image_url'),
  specializations: jsonb('specializations'), // string[] - e.g. ['carpentry', 'electrical']
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  rating: real('rating').default(0),
  totalReviews: integer('total_reviews').default(0),
  verified: boolean('verified').default(false),
  yearsExperience: integer('years_experience'),
  portfolioKeys: jsonb('portfolio_keys'), // string[] of image storage keys
  portfolioUrls: jsonb('portfolio_urls'), // string[] of external portfolio URLs
  certifications: jsonb('certifications'), // string[] of licenses/certifications
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const contractorReviews = pgTable('contractor_reviews', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  contractorId: text('contractor_id')
    .notNull()
    .references(() => contractors.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  rating: integer('rating').notNull(), // 1-5
  title: text('title'),
  review: text('review'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const contractorAssignments = pgTable('contractor_assignments', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  contractorId: text('contractor_id')
    .notNull()
    .references(() => contractors.id, { onDelete: 'cascade' }),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // e.g. 'general_contractor', 'electrician', 'carpenter'
  status: text('status').notNull().default('active'), // active, completed, terminated
  startDate: timestamp('start_date', { mode: 'date' }),
  endDate: timestamp('end_date', { mode: 'date' }),
  agreedAmount: real('agreed_amount'),
  currency: text('currency').default('USD'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Y.js Collaboration Documents — persisted editor state
// ---------------------------------------------------------------------------
export const yjsDocuments = pgTable('yjs_documents', {
  docId: text('doc_id').primaryKey(),
  state: text('state'), // base64-encoded Y.js binary state
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// ===========================================================================
// PHASE 4: INTELLIGENCE
// ===========================================================================

// ---------------------------------------------------------------------------
// Cost Predictions — AI-generated cost forecasts
// ---------------------------------------------------------------------------
export const costPredictions = pgTable('cost_predictions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  predictedCost: real('predicted_cost').notNull(),
  confidenceLow: real('confidence_low').notNull(),
  confidenceHigh: real('confidence_high').notNull(),
  riskFactors: jsonb('risk_factors'), // { name, impact, probability }[]
  breakdown: jsonb('breakdown'), // { category, amount }[]
  modelProvider: text('model_provider').notNull(),
  inputSnapshot: jsonb('input_snapshot'), // snapshot of project data used
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Timeline Predictions — AI-generated timeline forecasts
// ---------------------------------------------------------------------------
export const timelinePredictions = pgTable('timeline_predictions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  predictedDays: integer('predicted_days').notNull(),
  confidenceLow: integer('confidence_low').notNull(),
  confidenceHigh: integer('confidence_high').notNull(),
  criticalRisks: jsonb('critical_risks'), // { name, delayDays, mitigation }[]
  phaseBreakdown: jsonb('phase_breakdown'), // { phase, days, dependencies }[]
  modelProvider: text('model_provider').notNull(),
  inputSnapshot: jsonb('input_snapshot'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Budget Scenarios — AI-optimized budget alternatives
// ---------------------------------------------------------------------------
export const budgetScenarios = pgTable('budget_scenarios', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  originalTotalCost: real('original_total_cost').notNull(),
  optimizedTotalCost: real('optimized_total_cost').notNull(),
  savingsAmount: real('savings_amount').notNull(),
  savingsPercent: real('savings_percent').notNull(),
  substitutions: jsonb('substitutions'), // { original, replacement, savings, reason }[]
  constraints: jsonb('constraints'), // string[] of user constraints
  status: text('status').notNull().default('draft'), // draft, accepted, rejected
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Sustainability Reports — carbon & green scoring
// ---------------------------------------------------------------------------
export const sustainabilityReports = pgTable('sustainability_reports', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  totalCarbonKg: real('total_carbon_kg').notNull(),
  materialCarbonKg: real('material_carbon_kg').notNull(),
  transportCarbonKg: real('transport_carbon_kg').notNull(),
  sustainabilityScore: integer('sustainability_score').notNull(), // 0-100
  leedPoints: integer('leed_points'),
  greenAlternatives: jsonb('green_alternatives'), // { material, alternative, carbonSaved, costDelta }[]
  modelProvider: text('model_provider'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Portfolios — multi-project grouping
// ---------------------------------------------------------------------------
export const portfolios = pgTable('portfolios', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Portfolio–Project associations
// ---------------------------------------------------------------------------
export const portfolioProjects = pgTable('portfolio_projects', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  portfolioId: text('portfolio_id')
    .notNull()
    .references(() => portfolios.id, { onDelete: 'cascade' }),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').default(0),
});

// ===========================================================================
// PHASE 5: ECOSYSTEM
// ===========================================================================

// ---------------------------------------------------------------------------
// Digital Twins
// ---------------------------------------------------------------------------
export const digitalTwins = pgTable('digital_twins', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  modelStorageKey: text('model_storage_key'),
  modelVersion: integer('model_version').default(1),
  status: text('status').notNull().default('draft'), // draft, active, archived
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// IoT Devices
// ---------------------------------------------------------------------------
export const iotDevices = pgTable('iot_devices', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  digitalTwinId: text('digital_twin_id')
    .notNull()
    .references(() => digitalTwins.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  deviceType: text('device_type').notNull(), // temperature, humidity, motion, energy, water
  positionJson: jsonb('position_json'), // { x, y, z }
  roomId: text('room_id').references(() => rooms.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('active'), // active, offline, maintenance
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// IoT Data Points
// ---------------------------------------------------------------------------
export const iotDataPoints = pgTable('iot_data_points', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  deviceId: text('device_id')
    .notNull()
    .references(() => iotDevices.id, { onDelete: 'cascade' }),
  value: real('value').notNull(),
  unit: text('unit').notNull(),
  timestamp: timestamp('timestamp', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Emergency References — shutoff/breaker locations
// ---------------------------------------------------------------------------
export const emergencyReferences = pgTable('emergency_references', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // water_shutoff, gas_shutoff, electrical_breaker, fire_extinguisher
  label: text('label').notNull(),
  description: text('description'),
  locationDescription: text('location_description'),
  positionJson: jsonb('position_json'), // { x, y, z }
  roomId: text('room_id').references(() => rooms.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Maintenance Schedules
// ---------------------------------------------------------------------------
export const maintenanceSchedules = pgTable('maintenance_schedules', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  itemName: text('item_name').notNull(),
  category: text('category').notNull(), // hvac, plumbing, electrical, structural, appliance, exterior
  frequencyDays: integer('frequency_days').notNull(),
  nextDueAt: timestamp('next_due_at', { mode: 'date' }).notNull(),
  provider: text('provider'),
  estimatedCost: real('estimated_cost'),
  status: text('status').notNull().default('active'), // active, paused, completed
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Maintenance Logs
// ---------------------------------------------------------------------------
export const maintenanceLogs = pgTable('maintenance_logs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  scheduleId: text('schedule_id')
    .notNull()
    .references(() => maintenanceSchedules.id, { onDelete: 'cascade' }),
  performedAt: timestamp('performed_at', { mode: 'date' }).defaultNow().notNull(),
  performedBy: text('performed_by'),
  cost: real('cost'),
  notes: text('notes'),
  photoKeys: jsonb('photo_keys'), // string[]
});

// ---------------------------------------------------------------------------
// Warranties
// ---------------------------------------------------------------------------
export const warranties = pgTable('warranties', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  itemName: text('item_name').notNull(),
  category: text('category').notNull(), // appliance, fixture, material, system
  brand: text('brand'),
  serialNumber: text('serial_number'),
  warrantyStartDate: timestamp('warranty_start_date', { mode: 'date' }).notNull(),
  warrantyEndDate: timestamp('warranty_end_date', { mode: 'date' }).notNull(),
  warrantyType: text('warranty_type').notNull().default('manufacturer'), // manufacturer, extended, contractor
  status: text('status').notNull().default('active'), // active, expired, claimed
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Warranty Claims
// ---------------------------------------------------------------------------
export const warrantyClaims = pgTable('warranty_claims', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  warrantyId: text('warranty_id')
    .notNull()
    .references(() => warranties.id, { onDelete: 'cascade' }),
  issueDescription: text('issue_description').notNull(),
  photoKeys: jsonb('photo_keys'), // string[]
  status: text('status').notNull().default('filed'), // filed, in_review, approved, denied, resolved
  claimDate: timestamp('claim_date', { mode: 'date' }).defaultNow().notNull(),
  resolutionDate: timestamp('resolution_date', { mode: 'date' }),
});

// ---------------------------------------------------------------------------
// Offcut Listings — leftover material marketplace
// ---------------------------------------------------------------------------
export const offcutListings = pgTable('offcut_listings', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  materialType: text('material_type').notNull(), // wood, tile, stone, metal, fabric, other
  quantity: real('quantity').notNull(),
  unit: text('unit').notNull(), // pieces, sqft, sqm, linear_ft, linear_m, kg
  dimensions: jsonb('dimensions'), // { length, width, thickness, unit }
  condition: text('condition').notNull().default('new'), // new, like_new, good, fair
  askingPrice: real('asking_price'),
  currency: text('currency').default('USD'),
  imageKeys: jsonb('image_keys'), // string[]
  location: text('location'),
  status: text('status').notNull().default('active'), // active, sold, expired, removed
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Offcut Inquiries
// ---------------------------------------------------------------------------
export const offcutInquiries = pgTable('offcut_inquiries', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  listingId: text('listing_id')
    .notNull()
    .references(() => offcutListings.id, { onDelete: 'cascade' }),
  buyerUserId: text('buyer_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  status: text('status').notNull().default('pending'), // pending, replied, accepted, declined
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Project Gallery Entries — community showcase
// ---------------------------------------------------------------------------
export const projectGalleryEntries = pgTable('project_gallery_entries', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  tags: jsonb('tags'), // string[]
  imageKeys: jsonb('image_keys'), // string[]
  style: text('style'),
  isPublic: boolean('is_public').default(true),
  likes: integer('likes').default(0),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Contractor Referrals
// ---------------------------------------------------------------------------
export const contractorReferrals = pgTable('contractor_referrals', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  referrerUserId: text('referrer_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  contractorId: text('contractor_id')
    .notNull()
    .references(() => contractors.id, { onDelete: 'cascade' }),
  refereeEmail: text('referee_email').notNull(),
  message: text('message'),
  status: text('status').notNull().default('sent'), // sent, viewed, hired
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Developer Apps — OAuth client registration
// ---------------------------------------------------------------------------
export const developerApps = pgTable('developer_apps', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  clientId: text('client_id').notNull().unique(),
  clientSecretHash: text('client_secret_hash').notNull(),
  redirectUris: jsonb('redirect_uris'), // string[]
  scopes: jsonb('scopes'), // string[]
  status: text('status').notNull().default('active'), // active, suspended, revoked
  rateLimitTier: text('rate_limit_tier').default('standard'), // standard, premium, enterprise
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// API Access Tokens
// ---------------------------------------------------------------------------
export const apiAccessTokens = pgTable('api_access_tokens', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  appId: text('app_id')
    .notNull()
    .references(() => developerApps.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  scopes: jsonb('scopes'), // string[]
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// API Request Logs
// ---------------------------------------------------------------------------
export const apiRequestLogs = pgTable('api_request_logs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  appId: text('app_id')
    .notNull()
    .references(() => developerApps.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  method: text('method').notNull(),
  statusCode: integer('status_code').notNull(),
  responseTimeMs: integer('response_time_ms'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Webhook Subscriptions
// ---------------------------------------------------------------------------
export const webhookSubscriptions = pgTable('webhook_subscriptions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  appId: text('app_id')
    .notNull()
    .references(() => developerApps.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(), // project.created, bom.generated, payment.completed, etc.
  targetUrl: text('target_url').notNull(),
  secret: text('secret').notNull(),
  status: text('status').notNull().default('active'), // active, paused, failed
  failureCount: integer('failure_count').default(0),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Exchange Rates — cached currency conversion rates
// ---------------------------------------------------------------------------
export const exchangeRates = pgTable('exchange_rates', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  fromCurrency: text('from_currency').notNull(),
  toCurrency: text('to_currency').notNull(),
  rate: real('rate').notNull(),
  source: text('source').default('manual'), // manual, api
  fetchedAt: timestamp('fetched_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Quality Checkpoints — stage-gate quality verification
// ---------------------------------------------------------------------------
export const qualityCheckpoints = pgTable('quality_checkpoints', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  milestone: text('milestone').notNull(), // e.g. 'demolition_complete', 'rough_in_complete', 'waterproofing_complete'
  title: text('title').notNull(),
  description: text('description'),
  trade: text('trade'), // electrical, plumbing, carpentry, painting, tiling, etc.
  status: text('status').notNull().default('pending'), // pending, in_progress, passed, failed
  inspectedBy: text('inspected_by'),
  checklistItems: jsonb('checklist_items'), // { item: string, checked: boolean, note?: string }[]
  photoKeys: jsonb('photo_keys'), // string[]
  notes: text('notes'),
  inspectedAt: timestamp('inspected_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Punch List Items — snag/defect tracking
// ---------------------------------------------------------------------------
export const punchListItems = pgTable('punch_list_items', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  roomId: text('room_id')
    .references(() => rooms.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  severity: text('severity').notNull().default('minor'), // critical, major, minor, observation
  category: text('category'), // structural, finish, electrical, plumbing, carpentry, painting
  status: text('status').notNull().default('open'), // open, in_progress, resolved, verified, reopened
  assignedTo: text('assigned_to'), // contractor name or ID
  photoKeys: jsonb('photo_keys'), // string[]
  locationPin: jsonb('location_pin'), // { x: number, y: number, floorPlanId?: string }
  resolvedAt: timestamp('resolved_at', { mode: 'date' }),
  verifiedAt: timestamp('verified_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Handover Packages — project completion & handover documentation
// ---------------------------------------------------------------------------
export const handoverPackages = pgTable('handover_packages', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('draft'), // draft, in_progress, ready, delivered
  asBuiltDrawingKeys: jsonb('as_built_drawing_keys'), // string[]
  materialRegister: jsonb('material_register'), // { item, brand, model, batch, purchaseDate, vendor }[]
  contractorDirectory: jsonb('contractor_directory'), // { name, trade, phone, email }[]
  operationalGuides: jsonb('operational_guides'), // { system, instructions }[]
  maintenanceManualKey: text('maintenance_manual_key'), // file key for generated PDF
  clientSignedAt: timestamp('client_signed_at', { mode: 'date' }),
  deliveredAt: timestamp('delivered_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Collaboration Threads — threaded discussions per room/element
// ---------------------------------------------------------------------------
export const collaborationThreads = pgTable('collaboration_threads', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  roomId: text('room_id')
    .references(() => rooms.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  category: text('category').notNull().default('general'), // general, design_decision, issue, change_request, approval
  status: text('status').notNull().default('open'), // open, resolved, archived
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Collaboration Messages — messages within threads
// ---------------------------------------------------------------------------
export const collaborationMessages = pgTable('collaboration_messages', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  threadId: text('thread_id')
    .notNull()
    .references(() => collaborationThreads.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  mentions: jsonb('mentions'), // string[] of user IDs
  attachmentKeys: jsonb('attachment_keys'), // string[]
  isDecision: boolean('is_decision').default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Delivery Tracking — material delivery logistics
// ---------------------------------------------------------------------------
export const deliveryTracking = pgTable('delivery_tracking', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  purchaseOrderId: text('purchase_order_id')
    .references(() => purchaseOrders.id, { onDelete: 'set null' }),
  vendorName: text('vendor_name').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('pending'), // pending, dispatched, in_transit, delivered, inspected, rejected
  trackingNumber: text('tracking_number'),
  estimatedDeliveryDate: timestamp('estimated_delivery_date', { mode: 'date' }),
  actualDeliveryDate: timestamp('actual_delivery_date', { mode: 'date' }),
  inspectionChecklist: jsonb('inspection_checklist'), // { item: string, passed: boolean, note?: string }[]
  inspectionPhotoKeys: jsonb('inspection_photo_keys'), // string[]
  receivedBy: text('received_by'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Style Preferences — design quiz & mood board
// ---------------------------------------------------------------------------
export const stylePreferences = pgTable('style_preferences', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  quizResponses: jsonb('quiz_responses'), // { questionId, selectedOption, imageUrl }[]
  detectedStyles: jsonb('detected_styles'), // { style: string, score: number }[]
  budgetTier: text('budget_tier'), // economy, mid_range, premium, luxury
  colorPreferences: jsonb('color_preferences'), // { palette: string[], warm: boolean }
  moodBoardItems: jsonb('mood_board_items'), // { imageUrl, caption, source, category }[]
  inspirationUrls: jsonb('inspiration_urls'), // string[]
  notes: text('notes'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});
