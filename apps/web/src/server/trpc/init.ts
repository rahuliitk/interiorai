import { initTRPC, TRPCError } from '@trpc/server';
import { auth } from '@/lib/auth';
import { db } from '@openlintel/db';
import { users } from '@openlintel/db';
import { eq } from 'drizzle-orm';
import superjson from 'superjson';

export const createTRPCContext = async () => {
  const session = await auth();
  return { session, db };
};

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Middleware that requires authentication
const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      userId: ctx.session.user.id,
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceAuth);

// Middleware that requires admin role
const enforceAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  const user = await ctx.db.query.users.findFirst({
    where: eq(users.id, ctx.session.user.id),
  });
  if (!user || user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      userId: ctx.session.user.id,
    },
  });
});

export const adminProcedure = t.procedure.use(enforceAdmin);
