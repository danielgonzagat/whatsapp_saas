-- CreateTable
CREATE TABLE "RAC_PipelineState" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'legacy',
    "transitionedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transitionedBy" TEXT,
    "snapshot" JSONB,
    "fallbackRate1h" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "RAC_PipelineState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RAC_PipelineState_workspaceId_key" ON "RAC_PipelineState" ("workspaceId");

-- CreateIndex
CREATE INDEX "RAC_PipelineState_state_idx" ON "RAC_PipelineState" ("state");

-- CreateTable
CREATE TABLE "RAC_DecisionShadow" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "inboundCorrelationId" TEXT NOT NULL,
    "orchestratorDecision" JSONB NOT NULL,
    "legacyBaseline" JSONB NOT NULL,
    "outcomeKey" TEXT NOT NULL,
    "outcomeAt" TIMESTAMP(3),
    "outcomeValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RAC_DecisionShadow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RAC_DecisionShadow_workspaceId_channel_createdAt_idx" ON "RAC_DecisionShadow" ("workspaceId", "channel", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RAC_DecisionShadow_workspaceId_inboundCorrelationId_key" ON "RAC_DecisionShadow" ("workspaceId", "inboundCorrelationId");
