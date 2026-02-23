import { relations } from 'drizzle-orm';
import { users, accounts, sessions } from './auth';
import {
  projects, rooms, designVariants, uploads, userApiKeys, jobs,
  bomResults, drawingResults, cutlistResults, mepCalculations,
  categories, products, vendors, productPrices, productEmbeddings,
  schedules, milestones, siteLogs, changeOrders,
  purchaseOrders, payments, invoices,
  comments, approvals, notifications,
  contractors, contractorReviews, contractorAssignments,
  yjsDocuments,
} from './app';

// ─── Auth Relations ──────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  projects: many(projects),
  uploads: many(uploads),
  apiKeys: many(userApiKeys),
  jobs: many(jobs),
  comments: many(comments),
  notifications: many(notifications),
  siteLogs: many(siteLogs),
  contractorReviews: many(contractorReviews),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

// ─── Core App Relations ──────────────────────────────────────────────────────

export const userApiKeysRelations = relations(userApiKeys, ({ one }) => ({
  user: one(users, { fields: [userApiKeys.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  rooms: many(rooms),
  uploads: many(uploads),
  jobs: many(jobs),
  schedules: many(schedules),
  siteLogs: many(siteLogs),
  changeOrders: many(changeOrders),
  purchaseOrders: many(purchaseOrders),
  payments: many(payments),
  invoices: many(invoices),
  comments: many(comments),
  approvals: many(approvals),
  contractorAssignments: many(contractorAssignments),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  project: one(projects, { fields: [rooms.projectId], references: [projects.id] }),
  designVariants: many(designVariants),
  uploads: many(uploads),
  jobs: many(jobs),
}));

export const designVariantsRelations = relations(designVariants, ({ one, many }) => ({
  room: one(rooms, { fields: [designVariants.roomId], references: [rooms.id] }),
  sourceUpload: one(uploads, { fields: [designVariants.sourceUploadId], references: [uploads.id] }),
  bomResults: many(bomResults),
  drawingResults: many(drawingResults),
  cutlistResults: many(cutlistResults),
  mepCalculations: many(mepCalculations),
}));

export const uploadsRelations = relations(uploads, ({ one }) => ({
  user: one(users, { fields: [uploads.userId], references: [users.id] }),
  project: one(projects, { fields: [uploads.projectId], references: [projects.id] }),
  room: one(rooms, { fields: [uploads.roomId], references: [rooms.id] }),
}));

// ─── Jobs ────────────────────────────────────────────────────────────────────

export const jobsRelations = relations(jobs, ({ one }) => ({
  user: one(users, { fields: [jobs.userId], references: [users.id] }),
  project: one(projects, { fields: [jobs.projectId], references: [projects.id] }),
  room: one(rooms, { fields: [jobs.roomId], references: [rooms.id] }),
  designVariant: one(designVariants, { fields: [jobs.designVariantId], references: [designVariants.id] }),
}));

// ─── BOM / Drawings / Cut List / MEP ─────────────────────────────────────────

export const bomResultsRelations = relations(bomResults, ({ one }) => ({
  designVariant: one(designVariants, { fields: [bomResults.designVariantId], references: [designVariants.id] }),
  job: one(jobs, { fields: [bomResults.jobId], references: [jobs.id] }),
}));

export const drawingResultsRelations = relations(drawingResults, ({ one }) => ({
  designVariant: one(designVariants, { fields: [drawingResults.designVariantId], references: [designVariants.id] }),
  job: one(jobs, { fields: [drawingResults.jobId], references: [jobs.id] }),
}));

export const cutlistResultsRelations = relations(cutlistResults, ({ one }) => ({
  designVariant: one(designVariants, { fields: [cutlistResults.designVariantId], references: [designVariants.id] }),
  job: one(jobs, { fields: [cutlistResults.jobId], references: [jobs.id] }),
}));

export const mepCalculationsRelations = relations(mepCalculations, ({ one }) => ({
  designVariant: one(designVariants, { fields: [mepCalculations.designVariantId], references: [designVariants.id] }),
  job: one(jobs, { fields: [mepCalculations.jobId], references: [jobs.id] }),
}));

// ─── Catalogue ───────────────────────────────────────────────────────────────

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'categoryParent',
  }),
  children: many(categories, { relationName: 'categoryParent' }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  vendor: one(vendors, { fields: [products.vendorId], references: [vendors.id] }),
  category_rel: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  prices: many(productPrices),
  productEmbedding: one(productEmbeddings, { fields: [products.id], references: [productEmbeddings.productId] }),
}));

export const productEmbeddingsRelations = relations(productEmbeddings, ({ one }) => ({
  product: one(products, { fields: [productEmbeddings.productId], references: [products.id] }),
}));

export const vendorsRelations = relations(vendors, ({ many }) => ({
  products: many(products),
  productPrices: many(productPrices),
  purchaseOrders: many(purchaseOrders),
}));

export const productPricesRelations = relations(productPrices, ({ one }) => ({
  product: one(products, { fields: [productPrices.productId], references: [products.id] }),
  vendor: one(vendors, { fields: [productPrices.vendorId], references: [vendors.id] }),
}));

// ─── Schedules / Milestones / Site Logs / Change Orders ──────────────────────

export const schedulesRelations = relations(schedules, ({ one, many }) => ({
  project: one(projects, { fields: [schedules.projectId], references: [projects.id] }),
  job: one(jobs, { fields: [schedules.jobId], references: [jobs.id] }),
  milestones: many(milestones),
}));

export const milestonesRelations = relations(milestones, ({ one, many }) => ({
  schedule: one(schedules, { fields: [milestones.scheduleId], references: [schedules.id] }),
  payments: many(payments),
}));

export const siteLogsRelations = relations(siteLogs, ({ one }) => ({
  project: one(projects, { fields: [siteLogs.projectId], references: [projects.id] }),
  user: one(users, { fields: [siteLogs.userId], references: [users.id] }),
}));

export const changeOrdersRelations = relations(changeOrders, ({ one }) => ({
  project: one(projects, { fields: [changeOrders.projectId], references: [projects.id] }),
  user: one(users, { fields: [changeOrders.userId], references: [users.id] }),
}));

// ─── Procurement / Payments / Invoices ───────────────────────────────────────

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one }) => ({
  project: one(projects, { fields: [purchaseOrders.projectId], references: [projects.id] }),
  vendor: one(vendors, { fields: [purchaseOrders.vendorId], references: [vendors.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  project: one(projects, { fields: [payments.projectId], references: [projects.id] }),
  milestone: one(milestones, { fields: [payments.milestoneId], references: [milestones.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  project: one(projects, { fields: [invoices.projectId], references: [projects.id] }),
  purchaseOrder: one(purchaseOrders, { fields: [invoices.purchaseOrderId], references: [purchaseOrders.id] }),
}));

// ─── Collaboration ───────────────────────────────────────────────────────────

export const commentsRelations = relations(comments, ({ one }) => ({
  user: one(users, { fields: [comments.userId], references: [users.id] }),
  project: one(projects, { fields: [comments.projectId], references: [projects.id] }),
}));

export const approvalsRelations = relations(approvals, ({ one }) => ({
  project: one(projects, { fields: [approvals.projectId], references: [projects.id] }),
  requester: one(users, { fields: [approvals.requestedBy], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

// ─── Contractors / Marketplace ───────────────────────────────────────────────

export const contractorsRelations = relations(contractors, ({ one, many }) => ({
  user: one(users, { fields: [contractors.userId], references: [users.id] }),
  reviews: many(contractorReviews),
  assignments: many(contractorAssignments),
}));

export const contractorReviewsRelations = relations(contractorReviews, ({ one }) => ({
  contractor: one(contractors, { fields: [contractorReviews.contractorId], references: [contractors.id] }),
  user: one(users, { fields: [contractorReviews.userId], references: [users.id] }),
  project: one(projects, { fields: [contractorReviews.projectId], references: [projects.id] }),
}));

export const contractorAssignmentsRelations = relations(contractorAssignments, ({ one }) => ({
  contractor: one(contractors, { fields: [contractorAssignments.contractorId], references: [contractors.id] }),
  project: one(projects, { fields: [contractorAssignments.projectId], references: [projects.id] }),
}));
