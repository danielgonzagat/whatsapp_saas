-- Drop orphan table: ProductCategory was never referenced in application code
-- or wired as a Workspace relation. No callers in backend, frontend, admin, or worker.
DROP TABLE IF EXISTS "RAC_ProductCategory";
