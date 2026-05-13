-- CreateTable
CREATE TABLE "RAC_DailyLimitCounter" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "capAtDay" INTEGER NOT NULL DEFAULT 25,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RAC_DailyLimitCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RAC_DailyLimitCounter_workspaceId_channel_day_key" ON "RAC_DailyLimitCounter" ("workspaceId", "channel", "day");

-- CreateIndex
CREATE INDEX "RAC_DailyLimitCounter_workspaceId_channel_day_idx" ON "RAC_DailyLimitCounter" ("workspaceId", "channel", "day");
