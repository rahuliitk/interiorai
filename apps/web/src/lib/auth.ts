import NextAuth from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@openlintel/db';
import { authConfig } from './auth.config';

/**
 * Full auth config with Drizzle adapter — Node.js only.
 * Used by Route Handlers and Server Components.
 */
const nextAuth = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db),
});

export const handlers = nextAuth.handlers;
export const auth = nextAuth.auth;
export const signIn = nextAuth.signIn;
export const signOut = nextAuth.signOut;
