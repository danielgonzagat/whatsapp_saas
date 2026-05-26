#!/usr/bin/env node
/**
 * Kloel SBOM Generator — creates CycloneDX bill of materials per workspace.
 * Uses @cyclonedx/cyclonedx-npm for each package.
 */
import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT_DIR = resolve(ROOT, 'tools/sbom');

const WORKSPACES = [
  { name: 'root', path: ROOT },
  { name: 'backend', path: resolve(ROOT, 'backend') },
  { name: 'frontend', path: resolve(ROOT, 'frontend') },
  { name: 'frontend-admin', path: resolve(ROOT, 'frontend-admin') },
  { name: 'worker', path: resolve(ROOT, 'worker') },
  { name: 'e2e', path: resolve(ROOT, 'e2e') },
];

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  const results = [];
  for (const ws of WORKSPACES) {
    if (!existsSync(resolve(ws.path, 'package.json'))) {
      console.log(`⚠️  ${ws.name}: no package.json, skipping`);
      continue;
    }
    try {
      const outPath = resolve(OUT_DIR, `sbom-${ws.name}.json`);
      execSync(`npx --yes @cyclonedx/cyclonedx-npm --output-file "${outPath}" --spec-version 1.5`, {
        cwd: ws.path,
        encoding: 'utf8',
        timeout: 60000,
        stdio: 'pipe',
      });
      const stats = require('fs').statSync(outPath);
      results.push({ workspace: ws.name, file: outPath, size: stats.size });
      console.log(`✅ ${ws.name}: SBOM generated (${(stats.size/1024).toFixed(1)} KB)`);
    } catch (e) {
      console.log(`⚠️  ${ws.name}: ${e.message?.slice(0, 100)}`);
    }
  }

  // Generate aggregate manifest
  const manifest = {
    generated: new Date().toISOString(),
    workspaces: results,
  };
  writeFileSync(resolve(OUT_DIR, 'sbom-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\n✅ SBOM manifest: ${results.length} workspaces indexed`);
}

main();
