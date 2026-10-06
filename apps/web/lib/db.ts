import { PrismaClient } from '../generated/prisma';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Schema lives at apps/web/prisma/schema.prisma, next to the package that declares both
// `prisma` and `@prisma/client`, so client generation resolves identically on every platform.
export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
