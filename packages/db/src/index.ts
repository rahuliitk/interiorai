import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// For query purposes — uses connection pooling
const queryClient = postgres(connectionString);
export const db = drizzle(queryClient, { schema });

// Re-export schema and types
export * from './schema';
export type Database = typeof db;

// Re-export drizzle-orm operators so consumers use the same instance
export { eq, and, or, ne, gt, gte, lt, lte, like, ilike, inArray, notInArray, isNull, isNotNull, sql, desc, asc, count, sum } from 'drizzle-orm';
