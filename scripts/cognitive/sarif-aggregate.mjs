#!/usr/bin/env node
/**
 * Kloel SARIF Aggregator — runs ESLint per workspace, transforms each
 * --format=json output to SARIF 2.1.0, and writes one .sarif file per
 * workspace plus an aggregate manifest at tools/sarif/manifest.json.
 *
 * SARIF 2.1.0 spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 *
 * Why SARIF: GitHub Code Scanning, Codacy, VS Code's Problems panel,
 * Azure DevOps and most enterprise dashboards all consume SARIF. Aggregating
 * here means agents query one canonical findings format instead of three.
 *
 * Modes:
 *   aggregate (default) — run eslint per workspace, write SARIF files
 *   summary            — print counts from existing on-disk SARIF
 *   workspace <name>   — run only that workspace
 */
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const OUT_DIR = resolve(ROOT, 'tools', 'sarif');

const WORKSPACES = [
  { name: 'backend', path: resolve(ROOT, 'backend'), glob: 'src/**/*.{ts,tsx}' },
  { name: 'frontend', path: resolve(ROOT, 'frontend'), glob: 'src/**/*.{ts,tsx}' },
  { name: 'frontend-admin', path: resolve(ROOT, 'frontend-admin'), glob: 'src/**/*.{ts,tsx}' },
  { name: 'worker', path: resolve(ROOT, 'worker'), glob: '**/*.{ts,tsx}' },
];

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const SEVERITY_TO_SARIF = { 2: 'error', 1: 'warning', 0: 'note' };

function eslintRunToSarif(workspaceName, results) {
  const ruleIds = new Set();
  const sarifResults = [];
  for (const file of results || []) {
    for (const msg of file.messages || []) {
      const rid = msg.ruleId || 'eslint/unknown';
      ruleIds.add(rid);
      sarifResults.push({
        ruleId: rid,
        level: SEVERITY_TO_SARIF[msg.severity] || 'note',
        message: { text: msg.message },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: file.filePath.replace(ROOT + '/', ''),
                uriBaseId: '%SRCROOT%',
              },
              region: {
                startLine: msg.line || 1,
                startColumn: msg.column || 1,
                endLine: msg.endLine || msg.line || 1,
                endColumn: msg.endColumn || msg.column || 1,
              },
            },
          },
        ],
      });
    }
  }
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'eslint',
            informationUri: 'https://eslint.org',
            rules: [...ruleIds].map((id) => ({ id, helpUri: `https://eslint.org/docs/rules/${id}` })),
          },
        },
        invocations: [
          {
            executionSuccessful: true,
            workingDirectory: { uri: `file://${WORKSPACES.find((w) => w.name === workspaceName).path}/` },
          },
        ],
        results: sarifResults,
        properties: {
          workspace: workspaceName,
          totalFindings: sarifResults.length,
          totalFiles: results.length,
        },
      },
    ],
  };
}

function runEslint(ws) {
  console.error(`[sarif] running eslint on ${ws.name} (${ws.glob})…`);
  try {
    // capture eslint --format json; ignore non-zero exit (eslint exits non-zero when findings exist)
    const out = execSync(
      `npx --no-install eslint --format json "${ws.glob}" 2>/dev/null || true`,
      { cwd: ws.path, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024, timeout: 180_000 },
    );
    if (!out.trim().startsWith('[')) {
      console.error(`[sarif] ${ws.name}: eslint produced no JSON (maybe lint config missing?) — empty SARIF`);
      return eslintRunToSarif(ws.name, []);
    }
    const results = JSON.parse(out);
    return eslintRunToSarif(ws.name, results);
  } catch (e) {
    console.error(`[sarif] ${ws.name}: ${e.message?.slice(0, 200)}`);
    return eslintRunToSarif(ws.name, []);
  }
}

function aggregate(only) {
  const manifest = { generatedAt: new Date().toISOString(), workspaces: [] };
  for (const ws of WORKSPACES) {
    if (only && ws.name !== only) continue;
    if (!existsSync(resolve(ws.path, 'eslint.config.mjs')) && !existsSync(resolve(ws.path, '.eslintrc.json'))) {
      console.error(`[sarif] ${ws.name}: no eslint config, skipping`);
      continue;
    }
    const sarif = runEslint(ws);
    const outFile = resolve(OUT_DIR, `${ws.name}.sarif`);
    writeFileSync(outFile, JSON.stringify(sarif, null, 2));
    const findings = sarif.runs[0].results.length;
    manifest.workspaces.push({ workspace: ws.name, file: `tools/sarif/${ws.name}.sarif`, findings });
    console.error(`[sarif] ${ws.name}: ${findings} findings → ${outFile.replace(ROOT + '/', '')}`);
  }
  writeFileSync(resolve(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.error(`[sarif] manifest → tools/sarif/manifest.json (${manifest.workspaces.length} workspaces)`);
}

function summary() {
  const manifestPath = resolve(OUT_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.error('No manifest. Run `node scripts/cognitive/sarif-aggregate.mjs` first.');
    process.exit(1);
  }
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  console.log(`SARIF summary (generated ${m.generatedAt}):`);
  let total = 0;
  for (const w of m.workspaces) {
    console.log(`  ${w.workspace.padEnd(16)} ${String(w.findings).padStart(6)} findings → ${w.file}`);
    total += w.findings;
  }
  console.log(`  ${'TOTAL'.padEnd(16)} ${String(total).padStart(6)} findings`);
}

const mode = process.argv[2] || 'aggregate';
if (mode === 'summary') summary();
else if (mode === 'workspace') aggregate(process.argv[3]);
else aggregate();
