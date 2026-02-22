import { router } from '../init';
import { projectRouter } from './project';
import { roomRouter } from './room';

export const appRouter = router({
  project: projectRouter,
  room: roomRouter,
});

export type AppRouter = typeof appRouter;
