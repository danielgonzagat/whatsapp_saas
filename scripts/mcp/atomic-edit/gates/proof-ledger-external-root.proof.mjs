#!/usr/bin/env node
/**
 * PROOF - proof receipts can live outside the product workspace.
 *
 * The Atomic ledger is operational evidence, not product code. When an agent is
 * working in a benchmark/product worktree, trace/snapshot/HEAD artifacts should
 * be preservable in an external proof ledger so they do not inflate the product
 * diff surface. The legacy in-repo .atomic ledger remains the default when no
 * external ledger root is configured.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const dir = path.dirname(fileURLToPath(import.meta.url));
const { buildTrace, writeTrace } = await import(path.join(dir, '..', 'dist', 'trace.js'));

let failures = 0;
const results = [];
function expect(cond, name, detail = undefined) {
  results.push({ name, ok: !!cond, detail });
  if (!cond) failures += 1;
}

function walk(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const abs = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

const subjectRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-ledger-subject-'));
const ledgerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-ledger-root-'));
const previous = process.env.ATOMIC_PROOF_LEDGER_ROOT;
process.env.ATOMIC_PROOF_LEDGER_ROOT = ledgerRoot;

try {
  const before = 'export const scheduledWorkflowStep = 1;\n';
  const after = 'export const scheduledWorkflowStep = 2;\n';
  const trace = buildTrace({
    file: 'src/workflow/index.ts',
    repoRoot: subjectRepo,
    operator: 'atomic_converge',
    before,
    newText: after,
    inlinePreview: 'scheduledWorkflowStep: [-1-]{+2+}',
    validation: { language: 'ts', before: 0, after: 0 },
    targetUnit: 'converged_text_span',
    intention: 'correct-by-construction commit',
    semanticImpact: 'green_convergent_commit',
    changed: true,
    gateVerdict: { green: true, reds: [], unjudged: [], ran: ['syntax', 'connection'] },
  });

  const persisted = writeTrace(trace, { before, after });
  const subjectAtomic = path.join(subjectRepo, '.atomic');
  const ledgerFiles = walk(ledgerRoot);
  const traceFiles = ledgerFiles.filter((file) => file.endsWith('.json') && file.includes(`${path.sep}traces${path.sep}`));
  const snapshotFiles = ledgerFiles.filter((file) => file.endsWith('.snap.json') && file.includes(`${path.sep}snapshots${path.sep}`));
  const headFiles = ledgerFiles.filter((file) => path.basename(file) === 'HEAD');
  const tracePath = typeof persisted.tracePath === 'string' ? persisted.tracePath : '';
  const snapshotPath = typeof persisted.snapshotPath === 'string' ? persisted.snapshotPath : '';

  expect(!persisted.traceWriteError, 'external-ledger writeTrace succeeds', persisted.traceWriteError);
  expect(!fs.existsSync(subjectAtomic), 'product workspace is left without .atomic ledger artifacts');
  expect(tracePath.startsWith(ledgerRoot), 'tracePath points at the external proof ledger', tracePath);
  expect(snapshotPath.startsWith(ledgerRoot), 'snapshotPath points at the external proof ledger', snapshotPath);
  expect(traceFiles.length === 1 && fs.existsSync(traceFiles[0]), 'external trace JSON exists exactly once', traceFiles);
  expect(snapshotFiles.length === 1 && fs.existsSync(snapshotFiles[0]), 'external snapshot JSON exists exactly once', snapshotFiles);
  expect(headFiles.length === 1 && fs.readFileSync(headFiles[0], 'utf8').trim() === trace.chainHash, 'external HEAD advances to the trace chain hash', headFiles);
  expect(trace.snapshotPath === snapshotPath, 'trace embeds the external snapshotPath it actually wrote');
} finally {
  if (previous === undefined) delete process.env.ATOMIC_PROOF_LEDGER_ROOT;
  else process.env.ATOMIC_PROOF_LEDGER_ROOT = previous;
  fs.rmSync(subjectRepo, { recursive: true, force: true });
  fs.rmSync(ledgerRoot, { recursive: true, force: true });
}

if (jsonMode) {
  console.log(JSON.stringify({ proof: 'proof-ledger-external-root', ok: failures === 0, results }));
} else {
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}`);
  console.log(failures === 0 ? 'PROOF PASS' : `PROOF FAIL (${failures} assertion(s) failed)`);
}
process.exit(failures === 0 ? 0 : 1);
