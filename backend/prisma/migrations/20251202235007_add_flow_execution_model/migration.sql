-- CreateTable
CREATE TABLE "FlowExecution" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT,
    "contactId" TEXT,
    "logs" JSONB,
    "state" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlowExecution_workspaceId_createdAt_idx" ON "FlowExecution"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "FlowExecution_flowId_createdAt_idx" ON "FlowExecution"("flowId", "createdAt");

-- AddForeignKey
ALTER TABLE "FlowExecution" ADD CONSTRAINT "FlowExecution_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowExecution" ADD CONSTRAINT "FlowExecution_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
