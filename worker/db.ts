import { PrismaClient } from "@prisma/client";

const enableQueryLogs = process.env.PRISMA_QUERY_LOGS === "true";

export const prisma = new PrismaClient({
  log: enableQueryLogs
    ? [{ emit: "event", level: "query" }, "warn", "error"]
    : ["warn", "error"],
});

if (enableQueryLogs) {
  prisma.$on("query", (event: any) => {
    if (event?.duration > 1000) {
      console.warn(
        `[PRISMA] slow query ${event.duration}ms: ${event.query?.slice(0, 240)}`,
      );
    }
  });
}

let shuttingDown = false;

async function shutdownPrisma(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  try {
    console.log(`[PRISMA] disconnecting on ${signal}...`);
    await prisma.$disconnect();
  } catch (error: any) {
    console.warn(
      `[PRISMA] disconnect failed during ${signal}:`,
      error?.message || error,
    );
  }
}

process.once("SIGTERM", () => {
  void shutdownPrisma("SIGTERM");
});

process.once("SIGINT", () => {
  void shutdownPrisma("SIGINT");
});
