export const PRISMA_OPERATION_RE =
  /\b(?:this\.)?prisma\.\w+\.(?:create|findMany|findUnique|findFirst|update|delete|upsert|count|aggregate|groupBy)\s*\(/;
export const QUEUE_OR_CACHE_RE =
  /\b(?:Queue|Worker|QueueEvents|createClient)\b|\.add\s*\(|\.process\s*\(|\.get\s*\(|\.set\s*\(/;
export const EXTERNAL_HTTP_RE =
  /\b(?:fetch|axios|httpService)\.(?:get|post|put|patch|delete|request)\s*\(|\bfetch\s*\(|\b[A-Za-z_$][\w$]*(?:Client|Provider|Gateway|Api|SDK|Sdk|Http)\.(?:get|post|put|patch|delete|request)\s*\(/;
export const WEBHOOK_RECEIVER_RE =
  /@(Post|All)\s*\([^)]*(callback|webhook|hook|event)[^)]*\)|signature|rawBody|x-[a-z-]*signature/i;

export const IMPORT_SPECIFIER_RE =
  /\b(?:import\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?|export\s+[^'"]+\s+from\s+|require\s*\(|import\s*\()\s*['"]([^'"]+)['"]/g;
export const ENV_REFERENCE_RE =
  /\bprocess\.env\.([A-Z][A-Z0-9_]{2,})\b|\b(?:configService|config)\.get(?:OrThrow)?\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]\s*\)/g;
export const URL_HOST_RE = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?/gi;
export const HTTP_CLIENT_IDENTIFIER_RE =
  /\b([A-Za-z_$][\w$]*(?:Client|Provider|Gateway|Api|SDK|Sdk|Http|Transport))\.(?:get|post|put|patch|delete|request|send|create|update)\s*\(/g;
export const EXTERNAL_PACKAGE_HINT_RE =
  /(?:api|auth|cache|client|cloud|gateway|http|mail|mq|payment|provider|queue|sdk|sms|storage|transport)$/i;
