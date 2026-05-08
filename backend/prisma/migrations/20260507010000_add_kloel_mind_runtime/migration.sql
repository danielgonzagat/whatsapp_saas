CREATE TABLE IF NOT EXISTS "RAC_MindBelief" (
    id TEXT PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    subject TEXT NOT NULL,
    predicate TEXT NOT NULL,
    context JSONB NOT NULL,
    mean DOUBLE PRECISION NOT NULL,
    variance DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    samples INTEGER NOT NULL DEFAULT 0,
    alpha DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    beta DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "lastUpdate" TIMESTAMP NOT NULL DEFAULT NOW(),
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "MindBelief_workspace_subject_predicate_context_unique"
        UNIQUE ("workspaceId", subject, predicate, context)
);

CREATE INDEX IF NOT EXISTS "MindBelief_workspace_predicate_idx"
ON "RAC_MindBelief" ("workspaceId", predicate);

CREATE INDEX IF NOT EXISTS "MindBelief_workspace_subject_idx"
ON "RAC_MindBelief" ("workspaceId", subject);

CREATE INDEX IF NOT EXISTS "MindBelief_context_gin_idx"
ON "RAC_MindBelief" USING GIN (context);

CREATE TABLE IF NOT EXISTS "RAC_MindPrediction" (
    id TEXT PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    subject TEXT NOT NULL,
    predicate TEXT NOT NULL,
    context JSONB NOT NULL,
    "predictedMean" DOUBLE PRECISION NOT NULL,
    "predictedVariance" DOUBLE PRECISION NOT NULL,
    "horizonSec" INTEGER NOT NULL,
    deadline TIMESTAMP NOT NULL,
    actual DOUBLE PRECISION,
    surprise DOUBLE PRECISION,
    "resolvedAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "MindPrediction_workspace_subject_idx"
ON "RAC_MindPrediction" ("workspaceId", subject);

CREATE INDEX IF NOT EXISTS "MindPrediction_unresolved_idx"
ON "RAC_MindPrediction" (deadline) WHERE "resolvedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "MindPrediction_workspace_predicate_idx"
ON "RAC_MindPrediction" ("workspaceId", predicate, "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "RAC_MindPolicy" (
    id TEXT PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    subject TEXT NOT NULL,
    "decisionType" TEXT NOT NULL,
    context JSONB NOT NULL,
    candidates JSONB NOT NULL,
    chosen TEXT NOT NULL,
    baseline TEXT NOT NULL,
    "reasonInternal" TEXT,
    "outcomeKey" TEXT,
    outcome DOUBLE PRECISION,
    "baselineOutcome" DOUBLE PRECISION,
    "resolvedAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "MindPolicy_workspace_decision_idx"
ON "RAC_MindPolicy" ("workspaceId", "decisionType", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "MindPolicy_outcome_key_idx"
ON "RAC_MindPolicy" ("outcomeKey") WHERE "outcomeKey" IS NOT NULL;
