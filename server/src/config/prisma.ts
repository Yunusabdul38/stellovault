import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from "../generated/prisma/client";

// 1. Database Connection Logic
const connectionString = process.env.DATABASE_URL;
// Cast to any to avoid @types/pg version conflict between root and adapter-pg's bundled types
const pool = new Pool({ connectionString }) as any;
const adapter = new PrismaPg(pool);

// 2. Prevent Multiple Instances (Singleton)
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter, // Required in Prisma 7
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}