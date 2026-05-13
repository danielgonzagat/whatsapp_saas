#!/usr/bin/env node
/**
 * PCI Validator — UTP-PCI-007
 *
 * Verifies the integrity of the Pacote de Contratos Imutáveis (PCI):
 *   - All canonical PCI documents are present.
 *   - Each has the canonical frontmatter (name, version, status).
 *   - Recorded checksums match current file content (when CHECKSUMS.txt exists).
 *   - Optional: scans repo for divergence from canonical event/ABI/gate names.
 *
 * Exit codes:
 *   0  — all checks pass
 *   1  — integrity failure
 *   2  — divergence in repo (event/ABI/gate name not in canonical list)
 *   3  — checksum mismatch (PCI was tampered after freeze)
 *
 * Usage:
 *   node scripts/pci/validate.mjs              # baseline checks
 *   node scripts/pci/validate.mjs --strict     # also fail on divergence
 *   node scripts/pci/validate.mjs --verify-checksums   # require CHECKSUMS.txt
 *   node scripts/pci/validate.mjs --json       # machine-readable output
 */

import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const PCI_DIR = resolve(REPO_ROOT, 'docs', 'contracts', 'pci');
const CHECKSUMS_PATH = resolve(PCI_DIR, 'CHECKSUMS.txt');

const CANONICAL_PCI_FILES = [
  '01-event-taxonomy.md',
  '02-abi-schema.md',
  '03-genesis-lineage.md',
  '04-pulse-gates.md',
  '05-universal-conventions.md',
  '06-b17-surfaces.md',
];

const REQUIRED_FRONTMATTER_TOKENS = [
  'Nome canônico',
  'Versão',
  'Status',
];

const args = new Set(process.argv.slice(2));
const STRICT = args.has('--strict');
const REQUIRE_CHECKSUMS = args.has('--verify-checksums');
const JSON_OUTPUT = args.has('--json');

const report = {
  timestamp: new Date().toISOString(),
  pciDir: PCI_DIR,
  filesChecked: [],
  errors: [],
  warnings: [],
  checksums: { recorded: null, computed: {}, mismatches: [] },
  divergences: [],
};

function log(msg) {
  if (!JSON_OUTPUT) process.stderr.write(msg + '\n');
}

function recordError(file, msg) {
  report.errors.push({ file, msg });
  log(`ERROR  ${file}: ${msg}`);
}

function recordWarning(file, msg) {
  report.warnings.push({ file, msg });
  log(`WARN   ${file}: ${msg}`);
}

function sha256OfBuffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function fileExists(path) {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

async function checkPciFiles() {
  for (const fname of CANONICAL_PCI_FILES) {
    const fpath = join(PCI_DIR, fname);
    if (!(await fileExists(fpath))) {
      recordError(fname, 'PCI file missing');
      continue;
    }
    const buf = await readFile(fpath);
    const text = buf.toString('utf8');
    const fileEntry = { fname, bytes: buf.length, frontmatterOk: true };
    for (const token of REQUIRED_FRONTMATTER_TOKENS) {
      if (!text.includes(token)) {
        recordError(fname, `missing canonical frontmatter token: "${token}"`);
        fileEntry.frontmatterOk = false;
      }
    }
    if (!/Status.*frozen/i.test(text) && !/Status.*draft/i.test(text)) {
      recordError(fname, 'Status field must be "frozen" or "draft"');
    }
    const hash = sha256OfBuffer(buf);
    report.checksums.computed[fname] = hash;
    fileEntry.sha256 = hash;
    report.filesChecked.push(fileEntry);
  }
}

async function checkChecksums() {
  if (!(await fileExists(CHECKSUMS_PATH))) {
    if (REQUIRE_CHECKSUMS) {
      recordError('CHECKSUMS.txt', 'CHECKSUMS.txt missing (required by --verify-checksums)');
    } else {
      recordWarning('CHECKSUMS.txt', 'CHECKSUMS.txt absent — PCI not yet frozen via UTP-PCI-008');
    }
    return;
  }
  const raw = (await readFile(CHECKSUMS_PATH, 'utf8')).split('\n');
  const recorded = {};
  for (const line of raw) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const [hash, fname] = parts;
    recorded[fname] = hash;
  }
  report.checksums.recorded = recorded;
  for (const fname of CANONICAL_PCI_FILES) {
    const want = recorded[fname];
    const have = report.checksums.computed[fname];
    if (!want) {
      recordError(fname, 'no checksum recorded in CHECKSUMS.txt');
      continue;
    }
    if (want !== have) {
      report.checksums.mismatches.push({ fname, want, have });
      recordError(fname, `checksum mismatch: recorded=${want} current=${have}`);
    }
  }
}

const CANONICAL_EVENT_DOMAINS = new Set([
  'lineage', 'cognition',
  'commerce.lead', 'commerce.cart', 'commerce.payment', 'commerce.crm',
  'commerce.whatsapp', 'commerce.campaign', 'commerce.member_area',
  'commerce.affiliate', 'commerce.kyc', 'commerce.post_sale',
  'goal_field', 'pulse', 'legitimacy', 'incentive', 'evolution',
]);

const CANONICAL_GATES = new Set([
  'no-roleplay', 'lineage-integrity', 'identity-projection',
  'no-overclaim', 'truth-mode-honesty', 'origin-immutability',
  'evidence-provenance', 'prompt-leakage', 'protected-files-firewall',
  'codacy-rigor-enforcer', 'ecosystem-privacy-guard',
  'internal-knowledge-leak-guard', 'platform-bias-monitor',
  'disclosure-engine',
]);

const CANONICAL_TRUTH_MODES = new Set(['observed', 'inferred', 'projected']);
const CANONICAL_VALENCES = new Set(['positive', 'negative', 'neutral', 'ambiguous']);
const CANONICAL_AUDIENCES = new Set(['public', 'technical', 'origin', 'internal']);
const CANONICAL_PROVENANCE_SOURCES = new Set(['synthetic', 'production']);

async function* walk(dir, ignored) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full, ignored);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out',
  '.turbo', '.cache', 'coverage', '.vercel', '.opencode',
  'frontend', 'frontend-admin', 'e2e',
]);

function isSourceFile(path) {
  const dot = path.lastIndexOf('.');
  return dot >= 0 && SOURCE_EXTENSIONS.has(path.slice(dot));
}

async function scanForDivergence() {
  const eventLiteralRe = /['"`]([a-z][a-z_]*\.[a-z][a-z_]*\.[a-z][a-z_]*)['"`]/g;
  const eventDottedDomainRe = /['"`]([a-z][a-z_]*\.[a-z][a-z_]*)\.[a-z][a-z_]*['"`]/g;
  for await (const fpath of walk(REPO_ROOT, IGNORED_DIRS)) {
    if (!isSourceFile(fpath)) continue;
    const rel = fpath.slice(REPO_ROOT.length + 1);
    if (rel.startsWith('docs/') || rel.startsWith('scripts/pci/')) continue;
    let text;
    try {
      text = await readFile(fpath, 'utf8');
    } catch {
      continue;
    }
    if (!text.includes('.')) continue;
    let m;
    eventLiteralRe.lastIndex = 0;
    while ((m = eventLiteralRe.exec(text))) {
      const evtName = m[1];
      const dotCount = evtName.split('.').length;
      if (dotCount !== 3) continue;
      const ctxBefore = text.slice(Math.max(0, m.index - 80), m.index);
      const looksLikeEventEmit = /(emit|publish|record|track|spine|event)/i.test(ctxBefore);
      if (!looksLikeEventEmit) continue;
      const domain = evtName.split('.').slice(0, 2).join('.');
      const topLevel = evtName.split('.')[0];
      if (
        !CANONICAL_EVENT_DOMAINS.has(domain) &&
        !CANONICAL_EVENT_DOMAINS.has(topLevel)
      ) {
        report.divergences.push({
          kind: 'event_name',
          file: rel,
          name: evtName,
          ctx: ctxBefore.slice(-60).trim(),
        });
      }
    }
  }
}

function summarize() {
  const summary = {
    pciFilesPresent: report.filesChecked.length,
    pciFilesExpected: CANONICAL_PCI_FILES.length,
    errors: report.errors.length,
    warnings: report.warnings.length,
    checksumMismatches: report.checksums.mismatches.length,
    divergences: report.divergences.length,
  };
  return summary;
}

async function main() {
  await checkPciFiles();
  await checkChecksums();
  if (STRICT) {
    await scanForDivergence();
  }
  const summary = summarize();
  if (JSON_OUTPUT) {
    process.stdout.write(JSON.stringify({ summary, report }, null, 2) + '\n');
  } else {
    log('---');
    log(`PCI files:  ${summary.pciFilesPresent}/${summary.pciFilesExpected}`);
    log(`errors:     ${summary.errors}`);
    log(`warnings:   ${summary.warnings}`);
    log(`checksum mismatches: ${summary.checksumMismatches}`);
    log(`divergences (strict mode): ${summary.divergences}`);
  }
  if (summary.checksumMismatches > 0) process.exit(3);
  if (STRICT && summary.divergences > 0) process.exit(2);
  if (summary.errors > 0) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`PCI validator crashed: ${err.stack || err.message}\n`);
  process.exit(1);
});
