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
});

export type AppRouter = typeof appRouter;
