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
  // Phase 4
  costPredictions, timelinePredictions, budgetScenarios,
  sustainabilityReports, portfolios, portfolioProjects,
  // Phase 5
  digitalTwins, iotDevices, iotDataPoints, emergencyReferences,
  maintenanceSchedules, maintenanceLogs, warranties, warrantyClaims,
  offcutListings, offcutInquiries, projectGalleryEntries, contractorReferrals,
  developerApps, apiAccessTokens, apiRequestLogs, webhookSubscriptions,
  exchangeRates,
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
  // Phase 4
  portfolios: many(portfolios),
  // Phase 5
  offcutListings: many(offcutListings),
  offcutInquiries: many(offcutInquiries),
  contractorReferrals: many(contractorReferrals),
  developerApps: many(developerApps),
  apiAccessTokens: many(apiAccessTokens),
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
  // Phase 4
  costPredictions: many(costPredictions),
  timelinePredictions: many(timelinePredictions),
  budgetScenarios: many(budgetScenarios),
  sustainabilityReports: many(sustainabilityReports),
  portfolioProjects: many(portfolioProjects),
  // Phase 5
  digitalTwins: many(digitalTwins),
  emergencyReferences: many(emergencyReferences),
  maintenanceSchedules: many(maintenanceSchedules),
  warranties: many(warranties),
  projectGalleryEntries: many(projectGalleryEntries),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  project: one(projects, { fields: [rooms.projectId], references: [projects.id] }),
  designVariants: many(designVariants),
  uploads: many(uploads),
  jobs: many(jobs),
  // Phase 5
  iotDevices: many(iotDevices),
  emergencyReferences: many(emergencyReferences),
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
  referrals: many(contractorReferrals),
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

// ===========================================================================
// PHASE 4: INTELLIGENCE
// ===========================================================================

export const costPredictionsRelations = relations(costPredictions, ({ one }) => ({
  project: one(projects, { fields: [costPredictions.projectId], references: [projects.id] }),
}));

export const timelinePredictionsRelations = relations(timelinePredictions, ({ one }) => ({
  project: one(projects, { fields: [timelinePredictions.projectId], references: [projects.id] }),
}));

export const budgetScenariosRelations = relations(budgetScenarios, ({ one }) => ({
  project: one(projects, { fields: [budgetScenarios.projectId], references: [projects.id] }),
}));

export const sustainabilityReportsRelations = relations(sustainabilityReports, ({ one }) => ({
  project: one(projects, { fields: [sustainabilityReports.projectId], references: [projects.id] }),
}));

export const portfoliosRelations = relations(portfolios, ({ one, many }) => ({
  user: one(users, { fields: [portfolios.userId], references: [users.id] }),
  portfolioProjects: many(portfolioProjects),
}));

export const portfolioProjectsRelations = relations(portfolioProjects, ({ one }) => ({
  portfolio: one(portfolios, { fields: [portfolioProjects.portfolioId], references: [portfolios.id] }),
  project: one(projects, { fields: [portfolioProjects.projectId], references: [projects.id] }),
}));

// ===========================================================================
// PHASE 5: ECOSYSTEM
// ===========================================================================

export const digitalTwinsRelations = relations(digitalTwins, ({ one, many }) => ({
  project: one(projects, { fields: [digitalTwins.projectId], references: [projects.id] }),
  iotDevices: many(iotDevices),
}));

export const iotDevicesRelations = relations(iotDevices, ({ one, many }) => ({
  digitalTwin: one(digitalTwins, { fields: [iotDevices.digitalTwinId], references: [digitalTwins.id] }),
  room: one(rooms, { fields: [iotDevices.roomId], references: [rooms.id] }),
  dataPoints: many(iotDataPoints),
}));

export const iotDataPointsRelations = relations(iotDataPoints, ({ one }) => ({
  device: one(iotDevices, { fields: [iotDataPoints.deviceId], references: [iotDevices.id] }),
}));

export const emergencyReferencesRelations = relations(emergencyReferences, ({ one }) => ({
  project: one(projects, { fields: [emergencyReferences.projectId], references: [projects.id] }),
  room: one(rooms, { fields: [emergencyReferences.roomId], references: [rooms.id] }),
}));

export const maintenanceSchedulesRelations = relations(maintenanceSchedules, ({ one, many }) => ({
  project: one(projects, { fields: [maintenanceSchedules.projectId], references: [projects.id] }),
  logs: many(maintenanceLogs),
}));

export const maintenanceLogsRelations = relations(maintenanceLogs, ({ one }) => ({
  schedule: one(maintenanceSchedules, { fields: [maintenanceLogs.scheduleId], references: [maintenanceSchedules.id] }),
}));

export const warrantiesRelations = relations(warranties, ({ one, many }) => ({
  project: one(projects, { fields: [warranties.projectId], references: [projects.id] }),
  claims: many(warrantyClaims),
}));

export const warrantyClaimsRelations = relations(warrantyClaims, ({ one }) => ({
  warranty: one(warranties, { fields: [warrantyClaims.warrantyId], references: [warranties.id] }),
}));

export const offcutListingsRelations = relations(offcutListings, ({ one, many }) => ({
  user: one(users, { fields: [offcutListings.userId], references: [users.id] }),
  inquiries: many(offcutInquiries),
}));

export const offcutInquiriesRelations = relations(offcutInquiries, ({ one }) => ({
  listing: one(offcutListings, { fields: [offcutInquiries.listingId], references: [offcutListings.id] }),
  buyer: one(users, { fields: [offcutInquiries.buyerUserId], references: [users.id] }),
}));

export const projectGalleryEntriesRelations = relations(projectGalleryEntries, ({ one }) => ({
  project: one(projects, { fields: [projectGalleryEntries.projectId], references: [projects.id] }),
}));

export const contractorReferralsRelations = relations(contractorReferrals, ({ one }) => ({
  referrer: one(users, { fields: [contractorReferrals.referrerUserId], references: [users.id] }),
  contractor: one(contractors, { fields: [contractorReferrals.contractorId], references: [contractors.id] }),
}));

export const developerAppsRelations = relations(developerApps, ({ one, many }) => ({
  user: one(users, { fields: [developerApps.userId], references: [users.id] }),
  accessTokens: many(apiAccessTokens),
  requestLogs: many(apiRequestLogs),
  webhookSubscriptions: many(webhookSubscriptions),
}));

export const apiAccessTokensRelations = relations(apiAccessTokens, ({ one }) => ({
  app: one(developerApps, { fields: [apiAccessTokens.appId], references: [developerApps.id] }),
  user: one(users, { fields: [apiAccessTokens.userId], references: [users.id] }),
}));

export const apiRequestLogsRelations = relations(apiRequestLogs, ({ one }) => ({
  app: one(developerApps, { fields: [apiRequestLogs.appId], references: [developerApps.id] }),
}));

export const webhookSubscriptionsRelations = relations(webhookSubscriptions, ({ one }) => ({
  app: one(developerApps, { fields: [webhookSubscriptions.appId], references: [developerApps.id] }),
}));
