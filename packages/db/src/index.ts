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
