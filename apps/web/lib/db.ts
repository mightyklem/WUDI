import { PrismaClient } from '../generated/prisma';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Schema lives at repo root ../prisma/schema.prisma; client output defaults to node_modules.
export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
