#!/usr/bin/env node
/**
 * Fixup shims for files where __parts__/ was created but the original was NOT
 * reduced. Reads each part file, extracts its top-level exports, then writes
 * a re-export shim to the original.
 *
 * Usage: node fixup-shims.mjs [--dry-run] [--worktree=path]
 *
 * Skips:
 *   - Spec files (*.spec.ts, *.spec.tsx) — those have no top-level exports.
 *   - Files where __parts__ dir is empty.
 *   - Files where the existing shim is small enough.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const WORKTREE_ARG = argv.find((a) => a.startsWith('--worktree='));
const WORKTREE = WORKTREE_ARG
  ? WORKTREE_ARG.split('=')[1]
  : '/Users/danielpenin/whatsapp_saas-pr198';

const TARGETS = [
  'scripts/pulse/adapters/external-sources-orchestrator.ts',
  'scripts/pulse/__tests__/capability-product-dynamic.spec.ts',
  'scripts/pulse/__tests__/no-hardcoded-reality.spec.ts',
  'scripts/pulse/__tests__/regression-guard.spec.ts',
  'scripts/pulse/artifacts.autonomy.ts',
  'scripts/pulse/artifacts.directive.ts',
  'scripts/pulse/ast-graph.ts',
  'scripts/pulse/authority-engine.ts',
  'scripts/pulse/autonomy-loop.unit-ranking.ts',
  'scripts/pulse/behavior-graph.ts',
  'scripts/pulse/browser-stress-tester/live-artifacts.ts',
  'scripts/pulse/cert-gate-multi-cycle.ts',
  'scripts/pulse/command-graph.ts',
  'scripts/pulse/continuous-daemon.ts',
  'scripts/pulse/contract-tester.ts',
  'scripts/pulse/cross-artifact-consistency-check/comparators.ts',
  'scripts/pulse/dataflow-engine.ts',
  'scripts/pulse/dynamic-reality-kernel.ts',
  'scripts/pulse/execution-harness-core.ts',
  'scripts/pulse/execution-matrix.ts',
  'scripts/pulse/flows/index.ts',
  'scripts/pulse/graph.ts',
  'scripts/pulse/index.ts',
  'scripts/pulse/merkle-cache.ts',
  'scripts/pulse/observability-coverage.ts',
  'scripts/pulse/otel-runtime.ts',
  'scripts/pulse/parser-registry.ts',
  'scripts/pulse/parsers/facade-detector.ts',
  'scripts/pulse/parsers/ui-parser.ts',
  'scripts/pulse/path-coverage-engine.ts',
  'scripts/pulse/perfectness-test.ts',
  'scripts/pulse/product-model.ts',
  'scripts/pulse/product-vision.ts',
  'scripts/pulse/production-proof.ts',
  'scripts/pulse/property-tester.ts',
  'scripts/pulse/real-sandbox.ts',
  'scripts/pulse/regression-guard.ts',
  'scripts/pulse/runtime-evidence.probes.ts',
  'scripts/pulse/runtime-fusion.ts',
  'scripts/pulse/safety-sandbox.ts',
  'scripts/pulse/scenario-engine.ts',
  'scripts/pulse/self-trust.ts',
  'scripts/pulse/source-root-detector.ts',
  'scripts/pulse/structural-memory.ts',
];

function extractNamedExports(content) {
  const exports = new Set();
  const reDecl =
    /^\s*export\s+(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;
  for (const m of content.matchAll(reDecl)) exports.add(m[1]);

  const reList = /^\s*export\s*\{\s*([^}]+?)\s*\}/gm;
  for (const m of content.matchAll(reList)) {
    const items = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const item of items) {
      const parts = item.split(/\s+as\s+/);
      const name = parts[parts.length - 1].trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) exports.add(name);
    }
  }
  if (/^\s*export\s+default\b/m.test(content)) exports.add('default');
  return [...exports];
}

function hasStarReexport(content) {
  return /^\s*export\s*\*\s+from\s+['"]/m.test(content);
}

function isSpecFile(filePath) {
  return /\.spec\.[jt]sx?$/.test(filePath);
}

function fileLines(absPath) {
  if (!existsSync(absPath)) return 0;
  return readFileSync(absPath, 'utf8').split('\n').length;
}

function findPartFiles(partsDir) {
  if (!existsSync(partsDir)) return [];
  const entries = readdirSync(partsDir);
  const files = [];
  for (const e of entries) {
    const full = join(partsDir, e);
    const st = statSync(full);
    if (st.isDirectory()) {
      for (const e2 of readdirSync(full)) {
        if (/\.(ts|tsx|mjs)$/.test(e2)) files.push(join(full, e2));
      }
    } else if (/\.(ts|tsx|mjs)$/.test(e)) {
      files.push(full);
    }
  }
  return files;
}

const SHIM_HEADER = '// Auto-generated re-export shim — body decomposed into ./__parts__/.';

function buildShim(originalRel, partFiles, worktreeRoot) {
  const baseNoExt = originalRel.replace(/\.(ts|tsx|mjs|cjs|jsx)$/, '');
  const baseName = basename(baseNoExt);
  const lines = [SHIM_HEADER];

  for (const partAbs of partFiles) {
    const content = readFileSync(partAbs, 'utf8');
    const partExports = extractNamedExports(content);
    const partHasStar = hasStarReexport(content);
    if (partExports.length === 0 && !partHasStar) continue;

    const partRelToWorktree = partAbs.replace(worktreeRoot + '/', '');
    let fromOrigin;
    if (partRelToWorktree.startsWith(baseNoExt + '/')) {
      fromOrigin =
        './' +
        partRelToWorktree
          .slice(baseNoExt.length - baseName.length)
          .replace(/\.(ts|tsx|mjs|cjs|jsx)$/, '');
    } else {
      fromOrigin =
        './' + baseName + '/__parts__/' + basename(partAbs).replace(/\.(ts|tsx|mjs|cjs|jsx)$/, '');
    }

    // Use wildcard re-export — safer with isolatedModules + mixed type/value exports.
    lines.push(`export * from '${fromOrigin}';`);
    // If this part has a default export, also re-export it explicitly.
    if (partExports.includes('default')) {
      lines.push(`export { default } from '${fromOrigin}';`);
    }
  }
  return lines.join('\n') + '\n';
}

let processed = 0;
let written = 0;
let skippedAlreadySmall = 0;
let skippedNoParts = 0;
let skippedSpec = 0;

for (const rel of TARGETS) {
  processed++;
  const abs = join(WORKTREE, rel);
  if (!existsSync(abs)) {
    console.log(`MISSING: ${rel}`);
    continue;
  }
  const baseNoExt = abs.replace(/\.(ts|tsx|mjs|cjs|jsx)$/, '');
  const partsDir = join(baseNoExt, '__parts__');

  if (isSpecFile(rel)) {
    skippedSpec++;
    console.log(`SKIP SPEC: ${rel} (manual handling required)`);
    continue;
  }

  const lines = fileLines(abs);
  if (lines <= 100) {
    skippedAlreadySmall++;
    continue;
  }

  const partFiles = findPartFiles(partsDir);
  if (partFiles.length === 0) {
    skippedNoParts++;
    console.log(`NO PARTS: ${rel} (${lines} lines, partsDir=${partsDir} empty)`);
    continue;
  }

  const shim = buildShim(rel, partFiles, WORKTREE);
  const shimLines = shim.split('\n').length;
  if (shimLines > 200) {
    console.log(
      `SUSPICIOUS SHIM: ${rel} would be ${shimLines} lines — skipping (manual review needed)`,
    );
    continue;
  }

  if (DRY) {
    console.log(`WOULD WRITE: ${rel} ${lines}L -> ${shimLines}L (parts=${partFiles.length})`);
  } else {
    writeFileSync(abs, shim);
    console.log(`WROTE: ${rel} ${lines}L -> ${shimLines}L (parts=${partFiles.length})`);
    written++;
  }
}

console.log(
  `\nSummary: processed=${processed} written=${written} skipped(small)=${skippedAlreadySmall} skipped(spec)=${skippedSpec} skipped(noparts)=${skippedNoParts}`,
);
