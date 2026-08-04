import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForDatabase = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

const pool =
  globalForDatabase.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    min: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 300_000,
    keepAlive: true,
  });

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
