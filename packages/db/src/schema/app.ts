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
