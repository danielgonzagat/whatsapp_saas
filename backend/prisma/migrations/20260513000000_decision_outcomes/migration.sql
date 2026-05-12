-- CreateTable
CREATE TABLE "RAC_DecisionOutcome" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "decisionType" TEXT NOT NULL,
    "chosenAction" TEXT NOT NULL,
    "baselineAction" TEXT,
    "outcomeKey" TEXT NOT NULL,
    "expectedWindow" INTEGER NOT NULL,
    "contextSnapshot" JSONB NOT NULL,
    "outcomeAt" TIMESTAMP(3),
    "outcomeName" TEXT,
    "outcomeValue" JSONB,
    "economicValue" DOUBLE PRECISION,
    "wonVsBaseline" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RAC_DecisionOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RAC_DecisionOutcome_outcomeKey_key" ON "RAC_DecisionOutcome"("outcomeKey");

-- CreateIndex
CREATE INDEX "RAC_DecisionOutcome_workspaceId_decisionType_createdAt_idx" ON "RAC_DecisionOutcome"("workspaceId", "decisionType", "createdAt");

-- CreateTable
CREATE TABLE "RAC_DecisionOutcomeEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "correlation" JSONB,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RAC_DecisionOutcomeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RAC_DecisionOutcomeEvent_workspaceId_eventType_createdAt_idx" ON "RAC_DecisionOutcomeEvent"("workspaceId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "RAC_DecisionOutcomeEvent_workspaceId_processed_createdAt_idx" ON "RAC_DecisionOutcomeEvent"("workspaceId", "processed", "createdAt");
