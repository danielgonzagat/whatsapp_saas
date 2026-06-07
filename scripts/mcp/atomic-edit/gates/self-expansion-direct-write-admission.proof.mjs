import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ioSource = fs.readFileSync(path.join(root, 'server-helpers-io.ts'), 'utf8');
const selfSource = fs.readFileSync(path.join(root, 'server-helpers-self-expansion.ts'), 'utf8');

function indexOfRequired(source, needle) {
  const index = source.indexOf(needle);
  return index >= 0 ? index : Number.POSITIVE_INFINITY;
}

const admissionCall = 'assertSelfExpansionAdmission(REPO_ROOT, absPath, content);';
const firstPhysicalWrite = "const fd = fs.openSync(tmp, 'w');";
const admissionImport = "import { assertSelfExpansionAdmission } from './" + "server-helpers-self-expansion.js';";

const checks = [
  {
    name: 'atomicWrite imports the self-expansion admission guard',
    ok: ioSource.includes(admissionImport),
  },
  {
    name: 'atomicWrite checks self-expansion admission before opening the temp write fd',
    ok: indexOfRequired(ioSource, admissionCall) < indexOfRequired(ioSource, firstPhysicalWrite),
  },
  {
    name: 'self-expansion path matcher covers atomic-edit source but excludes generated dist',
    ok:
      selfSource.includes("rel.startsWith('scripts/mcp/atomic-edit/')") &&
      selfSource.includes("rel.includes('/dist/')"),
  },
  {
    name: 'direct self writes fail closed to atomic_expand_self',
    ok:
      selfSource.includes('refused (self-expansion admission)') &&
      selfSource.includes('Expanding the atomic MCP is allowed only through atomic_expand_self') &&
      selfSource.includes('implements the missing computation inside atomic under proof'),
  },
  {
    name: 'self-expansion admission is scoped and cannot remain open after exceptions',
    ok:
      selfSource.includes('selfExpansionAdmissionDepth += 1') &&
      selfSource.includes('finally') &&
      selfSource.includes('selfExpansionAdmissionDepth -= 1'),
  },
];

const failed = checks.filter((check) => !check.ok);
const payload = { ok: failed.length === 0, results: checks };
if (process.argv.includes('--json')) console.log(JSON.stringify(payload, null, 2));
else for (const check of checks) console.log((check.ok ? 'PASS' : 'FAIL') + ' ' + check.name);
if (failed.length > 0) process.exit(1);
