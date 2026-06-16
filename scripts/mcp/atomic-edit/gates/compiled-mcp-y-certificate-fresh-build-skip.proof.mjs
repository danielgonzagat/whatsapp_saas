#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(sourceDir, 'gates', 'compiled-mcp-y-certificate.proof.mjs'), 'utf8');
const results = [];
function record(name, ok, detail = {}) { results.push({ name, ok: Boolean(ok), detail }); }

record('compiled certificate proof checks freshness before build',
  source.includes("let freshness = runProof('dist-freshness.proof.mjs');") &&
    source.indexOf("let freshness = runProof('dist-freshness.proof.mjs');") < source.indexOf('build = runBuild();'),
  {
    freshnessIndex: source.indexOf("let freshness = runProof('dist-freshness.proof.mjs');"),
    buildIndex: source.indexOf('build = runBuild();'),
  },
);
record('compiled certificate proof skips only when dist is already proven fresh',
  source.includes('skipped: true') &&
    source.includes("reason: 'dist already fresh before compiled certificate proof'") &&
    source.includes('if (!distFreshnessGreen) {\n    build = runBuild();'),
  {
    hasSkippedMarker: source.includes('skipped: true'),
    hasReason: source.includes('dist already fresh before compiled certificate proof'),
    staleBranchRunsBuild: source.includes('if (!distFreshnessGreen) {\n    build = runBuild();'),
  },
);
record('compiled certificate proof rechecks freshness after fallback build',
  source.includes("freshness = runProof('dist-freshness.proof.mjs');") &&
    source.includes('distFreshnessGreen = freshness.status === 0 && freshness.parsed?.ok === true;') &&
    source.includes('return { ok: false, build, freshness, assertion: { buildGreen, distFreshnessGreen } };'),
  {
    rechecksFreshness: source.includes("freshness = runProof('dist-freshness.proof.mjs');"),
    recomputesGreen: source.includes('distFreshnessGreen = freshness.status === 0 && freshness.parsed?.ok === true;'),
  },
);

const ok = results.every((entry) => entry.ok);
if (jsonMode || !ok) console.log(JSON.stringify({ ok, results }, null, 2));
process.exit(ok ? 0 : 1);
