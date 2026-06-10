import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'server-tools-self.ts'), 'utf8');

const checks = [
  {
    name: 'SelfFileOp admits replace_text without removing file-level ops',
    ok: source.includes("op: 'create' | 'replace' | 'delete' | 'replace_text';"),
  },
  {
    name: 'input schema admits replace_text and exact text fields',
    ok:
      source.includes("op: z.enum(['create', 'replace', 'delete', 'replace_text'])") &&
      source.includes('oldText: z.string().optional()') &&
      source.includes('newText: z.string().optional()') &&
      source.includes('occurrence: z.number().int().positive().optional()'),
  },
  {
    name: 'parser preserves replace_text, oldText, newText, and positive occurrence',
    ok:
      source.includes("e.op === 'replace_text'") &&
      source.includes("oldText: typeof e.oldText === 'string' ? e.oldText : undefined") &&
      source.includes("newText: typeof e.newText === 'string' ? e.newText : undefined") &&
      source.includes("Number.isInteger(e.occurrence) && e.occurrence > 0"),
  },
  {
    name: 'replace_text requires exact oldText match and refuses ambiguous ranges without occurrence',
    ok:
      source.includes("if (entry.op === 'replace_text')") &&
      source.includes('replace_text requires non-empty oldText') &&
      source.includes('replace_text oldText matched 0 ranges') &&
      source.includes('replace_text matched ${matches.length} ranges; pass occurrence') &&
      source.includes('replace_text occurrence ${entry.occurrence} outside ${matches.length} match(es)'),
  },
  {
    name: 'replace_text is byte-range negative-proof gated before atomic write',
    ok:
      source.includes("action: 'atomic_expand_self:replace_text'") &&
      source.includes("targetUnit: 'self-text-range'") &&
      source.includes('before.slice(0, start) + entry.newText + before.slice(start + entry.oldText.length)') &&
      source.includes('atomicWrite(absPath, after)'),
  },
  {
    name: 'self-expansion guards expectedSha256 once per target across multi-op transactions',
    ok:
      source.includes('guardedRelPaths?: Set<string>') &&
      source.includes('const firstTouch = !guardedRelPaths?.has(relPath)') &&
      source.includes('if (firstTouch && before !== null) guardSha(before, entry.expectedSha256)') &&
      source.includes('if (firstTouch) guardedRelPaths?.add(relPath)') &&
      source.includes('const guardedSelfPaths = new Set<string>()') &&
      source.includes('applySelfFileOp(op, guardedSelfPaths)'),
  },
];

const failed = checks.filter((check) => !check.ok);
const payload = { ok: failed.length === 0, results: checks };
if (process.argv.includes('--json')) console.log(JSON.stringify(payload, null, 2));
else for (const check of checks) console.log((check.ok ? 'PASS' : 'FAIL') + ' ' + check.name);
if (failed.length > 0) process.exit(1);
