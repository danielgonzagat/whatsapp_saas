-- AlterTable
ALTER TABLE "RAC_Workspace" ADD COLUMN     "globalPriorOptOut" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RAC_KloelGlobalPrior" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "decisionType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "observations" INTEGER NOT NULL DEFAULT 0,
    "successes" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RAC_KloelGlobalPrior_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RAC_KloelGlobalPrior_channel_decisionType_action_key" ON "RAC_KloelGlobalPrior"("channel", "decisionType", "action");

-- CreateIndex
CREATE INDEX "RAC_KloelGlobalPrior_channel_decisionType_idx" ON "RAC_KloelGlobalPrior"("channel", "decisionType");
