import { pgTable, text, timestamp, integer, jsonb, real } from 'drizzle-orm/pg-core';
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
  storageKey: text('storage_key').notNull(), // path in storage (S3/local)
  category: text('category').notNull().default('photo'), // photo, floor_plan, document
  thumbnailKey: text('thumbnail_key'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
