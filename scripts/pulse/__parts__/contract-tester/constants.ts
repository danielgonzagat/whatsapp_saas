// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CANONICAL_ARTIFACT_FILENAME = 'PULSE_CONTRACT_EVIDENCE.json';

export const MIGRATIONS_DIRS = ['backend/prisma/migrations', 'prisma/migrations'];

export const HTTP_METHOD_PATTERN = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/;

export const IGNORE_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  '.git',
  'coverage',
  '__tests__',
  '__mocks__',
  '.turbo',
  '.vercel',
]);

// ---------------------------------------------------------------------------
// SQL parsing matchers for destructive migration operations
// ---------------------------------------------------------------------------

export const DROP_TABLE_RE = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?[`"]?(\w+)[`"]?/gi;
export const DROP_COLUMN_RE = /DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?[`"]?(\w+)[`"]?/gi;
export const ALTER_COLUMN_TYPE_RE =
  /ALTER\s+COLUMN\s+[`"]?(\w+)[`"]?\s+(?:SET\s+DATA\s+)?TYPE\s+(\w+(?:\s*\(\s*\d+\s*(?:,\s*\d+\s*)?\))?)/gi;
