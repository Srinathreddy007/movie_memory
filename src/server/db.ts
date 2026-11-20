import "server-only"; // build fails if the DB client is ever imported by browser code
import { PrismaClient } from "@prisma/client";

// Reuse one PrismaClient across hot reloads in dev; otherwise every reload
// would open a new connection pool and eventually exhaust Postgres.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
