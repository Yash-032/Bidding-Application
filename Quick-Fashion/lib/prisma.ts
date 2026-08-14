import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForDatabase = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
  pgPoolErrorHandlerAttached?: boolean;
  pgPoolWarmup?: Promise<void>;
};

const pool =
  globalForDatabase.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    min: 1,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 300_000,
    keepAlive: true,
  });

// Next.js can re-evaluate this module repeatedly in development while retaining
// the global pool. Attach the listener once so HMR does not leak listeners.
if (!globalForDatabase.pgPoolErrorHandlerAttached) {
  pool.on("error", (err) => {
    console.warn("[pg-pool] Idle connection error (auto-recovering):", err.message);
  });
  globalForDatabase.pgPoolErrorHandlerAttached = true;
}

export const prisma =
  globalForDatabase.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(pool),
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

globalForDatabase.pgPool = pool;
globalForDatabase.prisma = prisma;

/** Keep one pooled connection available so page navigation does not repeatedly pay a cold database-connect cost. */
export function warmDatabaseConnection() {
  if (!globalForDatabase.pgPoolWarmup) {
    globalForDatabase.pgPoolWarmup = pool
      .query('SELECT 1')
      .then(() => undefined)
      .catch((error) => {
        console.warn('[pg-pool] Initial database warm-up failed:', error.message);
      });
  }

  return globalForDatabase.pgPoolWarmup;
}
// This module is only imported by Node.js server routes; begin warming the pool as soon as one loads.
void warmDatabaseConnection();
