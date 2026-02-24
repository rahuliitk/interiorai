import { router } from '../init';
import { projectRouter } from './project';
import { roomRouter } from './room';
import { uploadRouter } from './upload';
import { designVariantRouter } from './designVariant';
import { apiKeyRouter } from './apiKey';
import { bomRouter } from './bom';
import { drawingRouter } from './drawing';
import { cutlistRouter } from './cutlist';
import { mepRouter } from './mep';
import { scheduleRouter } from './schedule';
import { paymentRouter } from './payment';
import { contractorRouter } from './contractor';
import { notificationRouter } from './notification';
import { adminRouter } from './admin';
import { analyticsRouter } from './analytics';
import { catalogueRouter } from './catalogue';
import { procurementRouter } from './procurement';
import { floorPlanRouter } from './floorPlan';
import { complianceRouter } from './compliance';
// Phase 4
import { predictionRouter } from './prediction';
import { budgetOptimizationRouter } from './budgetOptimization';
import { sustainabilityRouter } from './sustainability';
import { portfolioRouter } from './portfolio';
// Phase 5
import { digitalTwinRouter } from './digitalTwin';
import { maintenanceRouter } from './maintenance';
import { warrantyRouter } from './warranty';
import { communityRouter } from './community';
import { developerPortalRouter } from './developerPortal';
import { localizationRouter } from './localization';

export const appRouter = router({
  project: projectRouter,
  room: roomRouter,
  upload: uploadRouter,
  designVariant: designVariantRouter,
  apiKey: apiKeyRouter,
  bom: bomRouter,
  drawing: drawingRouter,
  cutlist: cutlistRouter,
  mep: mepRouter,
  schedule: scheduleRouter,
  payment: paymentRouter,
  contractor: contractorRouter,
  notification: notificationRouter,
  admin: adminRouter,
  analytics: analyticsRouter,
  catalogue: catalogueRouter,
  procurement: procurementRouter,
  floorPlan: floorPlanRouter,
  compliance: complianceRouter,
  // Phase 4
  prediction: predictionRouter,
  budgetOptimization: budgetOptimizationRouter,
  sustainability: sustainabilityRouter,
  portfolio: portfolioRouter,
  // Phase 5
  digitalTwin: digitalTwinRouter,
  maintenance: maintenanceRouter,
  warranty: warrantyRouter,
  community: communityRouter,
  developerPortal: developerPortalRouter,
  localization: localizationRouter,
});

export type AppRouter = typeof appRouter;
