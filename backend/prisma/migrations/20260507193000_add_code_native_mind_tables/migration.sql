CREATE TABLE IF NOT EXISTS "RAC_MindWorkspaceState" (
    id TEXT PRIMARY KEY,
    "workspaceId" TEXT NOT NULL UNIQUE REFERENCES "RAC_Workspace" (
        id
    ) ON DELETE CASCADE,
    "lastWatermark" TIMESTAMP (3),
    "lastTickAt" TIMESTAMP (3),
    "lastTickMs" INTEGER NOT NULL DEFAULT 0,
    "tickLeaseOwner" TEXT,
    "tickLeaseUntil" TIMESTAMP (3),
    "tickCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "perceivedWindow" INTEGER NOT NULL DEFAULT 0,
    "surpriseWindow" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openDecisions" INTEGER NOT NULL DEFAULT 0,
    health JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "RAC_MindCase" (
    id TEXT PRIMARY KEY,
    "workspaceId" TEXT NOT NULL REFERENCES "RAC_Workspace" (
        id
    ) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    "caseType" TEXT NOT NULL,
    text TEXT NOT NULL,
    tokens TEXT [] NOT NULL,
    features JSONB NOT NULL,
    action TEXT NOT NULL,
    outcome DOUBLE PRECISION,
    "occurredAt" TIMESTAMP (3) NOT NULL,
    "createdAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "RAC_MindCase_workspaceId_caseType_occurredAt_idx"
ON "RAC_MindCase" ("workspaceId", "caseType", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "RAC_MindCase_workspaceId_subject_occurredAt_idx"
ON "RAC_MindCase" ("workspaceId", subject, "occurredAt" DESC);

CREATE TABLE IF NOT EXISTS "RAC_MindConceptDetection" (
    id TEXT PRIMARY KEY,
    "workspaceId" TEXT NOT NULL REFERENCES "RAC_Workspace" (
        id
    ) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    concept TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    evidence TEXT NOT NULL,
    features JSONB NOT NULL,
    "occurredAt" TIMESTAMP (3) NOT NULL,
    "createdAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS
"RAC_MindConceptDetection_workspaceId_concept_occurredAt_idx"
ON "RAC_MindConceptDetection" ("workspaceId", concept, "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS
"RAC_MindConceptDetection_workspaceId_subject_occurredAt_idx"
ON "RAC_MindConceptDetection" ("workspaceId", subject, "occurredAt" DESC);

CREATE TABLE IF NOT EXISTS "RAC_MindGraphNode" (
    id TEXT PRIMARY KEY,
    "workspaceId" TEXT NOT NULL REFERENCES "RAC_Workspace" (
        id
    ) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    weight DOUBLE PRECISION NOT NULL DEFAULT 1,
    metadata JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "RAC_MindGraphNode_workspaceId_kind_label_key"
ON "RAC_MindGraphNode" ("workspaceId", kind, label);
CREATE INDEX IF NOT EXISTS "RAC_MindGraphNode_workspaceId_kind_weight_idx"
ON "RAC_MindGraphNode" ("workspaceId", kind, weight);

CREATE TABLE IF NOT EXISTS "RAC_MindGraphEdge" (
    id TEXT PRIMARY KEY,
    "workspaceId" TEXT NOT NULL REFERENCES "RAC_Workspace" (
        id
    ) ON DELETE CASCADE,
    "fromNode" TEXT NOT NULL,
    "toNode" TEXT NOT NULL,
    relation TEXT NOT NULL,
    weight DOUBLE PRECISION NOT NULL DEFAULT 1,
    samples INTEGER NOT NULL DEFAULT 1,
    metadata JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS
"RAC_MindGraphEdge_workspaceId_fromNode_relation_toNode_key"
ON "RAC_MindGraphEdge" ("workspaceId", "fromNode", relation, "toNode");
CREATE INDEX IF NOT EXISTS "RAC_MindGraphEdge_workspaceId_relation_weight_idx"
ON "RAC_MindGraphEdge" ("workspaceId", relation, weight);

CREATE TABLE IF NOT EXISTS "RAC_MindOutboxEvent" (
    id TEXT PRIMARY KEY,
    "workspaceId" TEXT NOT NULL REFERENCES "RAC_Workspace" (
        id
    ) ON DELETE CASCADE,
    "eventType" TEXT NOT NULL,
    subject TEXT NOT NULL,
    payload JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    "dispatchedAt" TIMESTAMP (3),
    "lastError" TEXT,
    "occurredAt" TIMESTAMP (3) NOT NULL,
    "createdAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS
"RAC_MindOutboxEvent_workspaceId_idempotencyKey_key"
ON "RAC_MindOutboxEvent" ("workspaceId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS
"RAC_MindOutboxEvent_workspaceId_eventType_occurredAt_idx"
ON "RAC_MindOutboxEvent" ("workspaceId", "eventType", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "RAC_MindOutboxEvent_status_createdAt_idx"
ON "RAC_MindOutboxEvent" (status, "createdAt");

CREATE TABLE IF NOT EXISTS "RAC_MindBanditArm" (
    id TEXT PRIMARY KEY,
    "workspaceId" TEXT NOT NULL REFERENCES "RAC_Workspace" (
        id
    ) ON DELETE CASCADE,
    "decisionType" TEXT NOT NULL,
    arm TEXT NOT NULL,
    context JSONB NOT NULL,
    alpha DOUBLE PRECISION NOT NULL DEFAULT 1,
    beta DOUBLE PRECISION NOT NULL DEFAULT 1,
    pulls INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "promotedAt" TIMESTAMP (3),
    "createdAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS
"RAC_MindBanditArm_workspaceId_decisionType_arm_key"
ON "RAC_MindBanditArm" ("workspaceId", "decisionType", arm);
CREATE INDEX IF NOT EXISTS
"RAC_MindBanditArm_workspaceId_decisionType_isActive_idx"
ON "RAC_MindBanditArm" ("workspaceId", "decisionType", "isActive");

CREATE TABLE IF NOT EXISTS "RAC_MindGuardAudit" (
    id TEXT PRIMARY KEY,
    "workspaceId" TEXT NOT NULL REFERENCES "RAC_Workspace" (
        id
    ) ON DELETE CASCADE,
    "guardName" TEXT NOT NULL,
    action TEXT NOT NULL,
    decision TEXT NOT NULL,
    allowed BOOLEAN NOT NULL,
    reason TEXT NOT NULL,
    context JSONB NOT NULL,
    "createdAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS
"RAC_MindGuardAudit_workspaceId_guardName_createdAt_idx"
ON "RAC_MindGuardAudit" ("workspaceId", "guardName", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "RAC_MindDailyReport" (
    id TEXT PRIMARY KEY,
    "workspaceId" TEXT NOT NULL REFERENCES "RAC_Workspace" (
        id
    ) ON DELETE CASCADE,
    "reportDate" TIMESTAMP (3) NOT NULL,
    content TEXT NOT NULL,
    "storageKey" TEXT,
    metrics JSONB NOT NULL,
    "createdAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS
"RAC_MindDailyReport_workspaceId_reportDate_key"
ON "RAC_MindDailyReport" ("workspaceId", "reportDate");

CREATE TABLE IF NOT EXISTS "RAC_MindGlobalPrior" (
    id TEXT PRIMARY KEY,
    "workspaceId" TEXT NOT NULL REFERENCES "RAC_Workspace" (
        id
    ) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    predicate TEXT NOT NULL,
    context JSONB NOT NULL,
    mean DOUBLE PRECISION NOT NULL,
    variance DOUBLE PRECISION NOT NULL,
    samples INTEGER NOT NULL,
    "anonymizedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP (3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS
"RAC_MindGlobalPrior_domain_predicate_context_key"
ON "RAC_MindGlobalPrior" (domain, predicate, context);
CREATE INDEX IF NOT EXISTS "RAC_MindGlobalPrior_domain_predicate_idx"
ON "RAC_MindGlobalPrior" (domain, predicate);
