-- Rollback: 20260319170000_autonomy_runtime_ledger
-- Reverses: AutonomyRun, AutonomyExecution tables and AutonomyMode enum

-- Drop foreign keys
ALTER TABLE "AutonomyExecution" DROP CONSTRAINT IF EXISTS "AutonomyExecution_workspaceId_fkey";
ALTER TABLE "AutonomyRun" DROP CONSTRAINT IF EXISTS "AutonomyRun_workspaceId_fkey";

-- Drop tables
DROP TABLE IF EXISTS "AutonomyExecution";
DROP TABLE IF EXISTS "AutonomyRun";

-- Drop enum
DROP TYPE IF EXISTS "AutonomyMode";
