import { router } from '../init';
import { projectRouter } from './project';
import { roomRouter } from './room';
import { uploadRouter } from './upload';
import { designVariantRouter } from './designVariant';
import { apiKeyRouter } from './apiKey';

export const appRouter = router({
  project: projectRouter,
  room: roomRouter,
  upload: uploadRouter,
  designVariant: designVariantRouter,
  apiKey: apiKeyRouter,
});

export type AppRouter = typeof appRouter;
