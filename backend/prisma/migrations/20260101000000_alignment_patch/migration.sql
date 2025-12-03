-- Alignment patch to reconcile schema drift (idempotent-ish with IF NOT EXISTS guards)

-- Ensure pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Ensure Workspace has jitter and providerSettings (dropped in older migration)
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "jitterMin" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "jitterMax" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "providerSettings" JSONB NOT NULL DEFAULT '{}';

-- FlowExecution: add currentNodeId if missing
ALTER TABLE "FlowExecution" ADD COLUMN IF NOT EXISTS "currentNodeId" TEXT;

-- Vector.embedding: switch to pgvector(1536) when not already using vector
DO $$
DECLARE
  col_udt text;
BEGIN
  SELECT c.udt_name INTO col_udt
  FROM information_schema.columns c
  WHERE c.table_name = 'Vector' AND c.column_name = 'embedding';

  IF col_udt IS DISTINCT FROM 'vector' THEN
    BEGIN
      -- Tentamos converter apenas se for seguro; caso falhe, apenas avisamos.
      ALTER TABLE "Vector"
        ALTER COLUMN "embedding" TYPE vector(1536)
        USING ("embedding"::text::vector(1536));
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skipping vector cast for Vector.embedding (udt=%)', col_udt;
    END;
  END IF;
END $$;

-- Recreate Tag table if missing
CREATE TABLE IF NOT EXISTS "Tag" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "color" TEXT DEFAULT '#000000',
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Tag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Tag_workspaceId_name_key" ON "Tag"("workspaceId","name");

-- Recreate contact-tag join table if missing (implicit m:n)
CREATE TABLE IF NOT EXISTS "_ContactToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "_ContactToTag_AB_unique" ON "_ContactToTag"("A", "B");
CREATE INDEX IF NOT EXISTS "_ContactToTag_B_index" ON "_ContactToTag"("B");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_ContactToTag_A_fkey') THEN
    ALTER TABLE "_ContactToTag" ADD CONSTRAINT "_ContactToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_ContactToTag_B_fkey') THEN
    ALTER TABLE "_ContactToTag" ADD CONSTRAINT "_ContactToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
