#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TEXT_EXTENSIONS = new Set([
  '.cjs', '.mjs', '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.toml', '.yml', '.yaml', '.sh', '.txt',
]);

function usage() {
  console.error('Usage: atomic-operational-hardcode-inventory.cjs --root <abs> [--path <rel> ...] [--include-protected] [--json]');
  process.exit(2);
}

function parseArgs(argv) {
  const out = { paths: [], includeProtected: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') out.root = argv[++index];
    else if (arg === '--path') out.paths.push(argv[++index]);
    else if (arg === '--include-protected') out.includeProtected = true;
    else if (arg === '--json') out.json = true;
    else usage();
  }
  if (!out.root || !path.isAbsolute(out.root)) usage();
  out.root = path.resolve(out.root);
  if (!fs.existsSync(out.root)) throw new Error('root not found: ' + out.root);
  if (out.paths.length === 0) out.paths = inferInventoryRoots(out.root);
  out.paths = out.paths.map((value) => normalizeRel(out.root, value));
  return out;
}

function normalizeRel(root, value) {
  const rel = path.isAbsolute(value) ? path.relative(root, value) : value;
  return rel.split(path.sep).join('/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function inferInventoryRoots(root) {
  return fs.existsSync(root) ? ['.'] : [];
}

function loadProtected(root) {
  const file = path.join(root, 'ops', 'protected-governance-files.json');
  if (!fs.existsSync(file)) return { exact: new Set(), prefixes: [] };
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    exact: new Set((parsed.protectedExact || []).map((value) => normalizeRel(root, value))),
    prefixes: (parsed.protectedPrefixes || []).map((value) => normalizeRel(root, value).replace(/\/+$/, '')),
  };
}

function isProtected(rel, protectedSpec) {
  if (protectedSpec.exact.has(rel)) return true;
  return protectedSpec.prefixes.some((prefix) => rel === prefix || rel.startsWith(prefix + '/'));
}

function walk(root, rel, files) {
  const abs = path.join(root, rel);
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    const base = path.basename(rel);
    if (base === '.git' || base === 'node_modules' || base === 'dist' || base === 'coverage') return;
    for (const name of fs.readdirSync(abs).sort()) walk(root, path.posix.join(rel, name), files);
    return;
  }
  if (!stat.isFile()) return;
  if (!TEXT_EXTENSIONS.has(path.extname(rel))) return;
  if (stat.size > 750_000) return;
  files.push(rel);
}

function evidence(line) {
  return line.trim().replace(/\s+/g, ' ').slice(0, 240);
}

function classify(rel, line, index) {
  const trimmed = line.trim();
  const lower = trimmed.toLowerCase();
  const findings = [];
  const push = (kind, reason) => findings.push({ file: rel, line: index + 1, kind, reason, evidence: evidence(line) });

  const securitySignals = /protected|governance|resolveSafeTarget|path containment|sha256|expectedSha256|atomicWrite|fsync|validation|rollback|refused|outside.*root|escape/i;
  const absolutePath = /['"]\/(Users|private|tmp|var|opt|home)\//;
  const fixedBenchmarkPath = /backend\/src\/kloel\/unified-agent|docs\/ai\/atomic-os-benchmark|scripts\/mcp\/atomic-edit/;
  const fixedArgFallback = /arg\(['"][^'"]+['"]\s*,\s*['"][^'"]+['"]\)|fallback\s*=\s*['"][^'"]+['"]/;
  const fixedNumericBudget = /\b(idleMs|maxMs|pollMs|timeout|budget|limit|max[A-Z][A-Za-z]+|min[A-Z][A-Za-z]+)\b.*\b\d{2,}\b/;
  const defaultArrayOrMap = /^const\s+(DEFAULT_|PRODUCT_|KNOWN_|ALLOWED_|PROTECTED_|FIXED_)[A-Z0-9_]*\s*=\s*(\[|new Set|new Map|\{)/;
  const promptContract = /do not|never|must|only|forbidden|allowed|required|contract|fastpath|prompt|constraints/i;
  const defaultTarget = /^\s*(target|spec|className|model|scopePrefix)\s*:\s*['"][^'"]+['"]|^\s*const\s+(target|spec|className|model|scopePrefix)\s*=\s*['"][^'"]+['"]/;

  if (absolutePath.test(trimmed)) push('operational_hardcode', 'absolute machine path embedded in source');
  if (fixedArgFallback.test(trimmed)) push('operational_hardcode', 'CLI argument has fixed fallback value');
  if (fixedBenchmarkPath.test(trimmed) && !securitySignals.test(trimmed)) push('operational_hardcode', 'task/tool path appears embedded as decision data');
  if (fixedNumericBudget.test(trimmed)) push('operational_hardcode', 'numeric budget/limit appears embedded');
  if (defaultTarget.test(trimmed)) push('operational_hardcode', 'default operational target/model/scope appears embedded');
  if (defaultArrayOrMap.test(trimmed)) push(securitySignals.test(trimmed) ? 'constitutional_invariant' : 'operational_hardcode', 'fixed named catalog/list/map');
  if (promptContract.test(trimmed) && trimmed.length > 100) push('prompt_or_contract_rigidity', 'long imperative prompt/contract text embedded');
  if (securitySignals.test(trimmed) && findings.length === 0) push('constitutional_invariant', 'security or validation invariant signal');
  if (lower.includes('todo') && lower.includes('hardcode')) push('review_needed', 'explicit hardcode TODO/debt marker');

  return findings;
}

function summarize(findings) {
  const byKind = {};
  const byFile = {};
  for (const finding of findings) {
    byKind[finding.kind] = (byKind[finding.kind] || 0) + 1;
    byFile[finding.file] = (byFile[finding.file] || 0) + 1;
  }
  return { byKind, byFile };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const protectedSpec = loadProtected(args.root);
  const files = [];
  for (const rel of args.paths) {
    const abs = path.join(args.root, rel);
    if (!fs.existsSync(abs)) continue;
    walk(args.root, rel, files);
  }
  const findings = [];
  for (const rel of [...new Set(files)].sort()) {
    const protectedFile = isProtected(rel, protectedSpec);
    if (protectedFile && !args.includeProtected) continue;
    const text = fs.readFileSync(path.join(args.root, rel), 'utf8');
    text.split(/\r?\n/).forEach((line, index) => {
      for (const finding of classify(rel, line, index)) findings.push({ ...finding, protectedFile });
    });
  }
  const result = {
    ok: true,
    root: args.root,
    scannedPaths: args.paths,
    scannedFileCount: files.length,
    findingCount: findings.length,
    summary: summarize(findings),
    findings,
  };
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('findings=' + result.findingCount);
    for (const [kind, count] of Object.entries(result.summary.byKind)) console.log(kind + '=' + count);
    for (const finding of findings.slice(0, 80)) {
      console.log(finding.kind + ' ' + finding.file + ':' + finding.line + ' ' + finding.reason + ' :: ' + finding.evidence);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
