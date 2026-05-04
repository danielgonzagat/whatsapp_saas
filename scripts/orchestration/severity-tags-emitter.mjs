#!/usr/bin/env node

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { rewriteMirrorFrontmatterTags } from '../obsidian-mirror-daemon-indexes.mjs';

const VAULT_ROOT = resolve(
  process.env.KLOEL_VAULT_ROOT || '/Users/danielpenin/Documents/Obsidian Vault',
);
const MIRROR_ROOT = resolve(
  process.env.KLOEL_MIRROR_ROOT || join(VAULT_ROOT, 'Kloel', '99 - Espelho do Codigo'),
);
const SOURCE_MIRROR_DIR = join(MIRROR_ROOT, '_source');

const SEVERITY_TAGS = {
  critical: 'findings/severity-critical',
  high: 'findings/severity-high',
  medium: 'findings/severity-medium',
  low: 'findings/severity-low',
};

const SEVERITY_TAG_PREFIX = 'findings/severity-';

function findSidecars(root) {
  const out = [];
  if (!existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(p);
      } else if (e.isFile() && e.name.endsWith('.findings.json')) {
        out.push(p);
      }
    }
  }
  return out;
}

function readMirrorTags(mirrorAbsPath) {
  if (!existsSync(mirrorAbsPath)) return null;
  const content = readFileSync(mirrorAbsPath, 'utf8');
  if (!content.startsWith('---\n')) return null;
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return null;
  const frontmatter = content.slice(4, end).split('\n');
  const tags = [];
  let inTags = false;
  for (const line of frontmatter) {
    if (line === 'tags:') {
      inTags = true;
      continue;
    }
    if (inTags) {
      if (line.startsWith('  - ')) {
        tags.push(line.slice(4));
        continue;
      }
      inTags = false;
    }
  }
  return tags;
}

function main() {
  const dry = process.argv.includes('--dry');

  if (!existsSync(SOURCE_MIRROR_DIR)) {
    process.stderr.write(
      `severity-tags-emitter: mirror source dir ${SOURCE_MIRROR_DIR} does not exist\n`,
    );
    process.exit(2);
  }

  const sidecars = findSidecars(SOURCE_MIRROR_DIR);
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  let mirrorsTouched = 0;

  for (const scPath of sidecars) {
    try {
      const sc = JSON.parse(readFileSync(scPath, 'utf8'));
      const sev = sc.dominantSeverity;
      if (!sev || !SEVERITY_TAGS[sev]) continue;

      const relMirror = relative(SOURCE_MIRROR_DIR, scPath).replace(/\.findings\.json$/, '.md');
      const mirrorAbs = join(SOURCE_MIRROR_DIR, relMirror);

      if (!existsSync(mirrorAbs)) continue;

      const existing = readMirrorTags(mirrorAbs);
      if (existing === null) continue;

      const merged = existing.filter((t) => !t.startsWith(SEVERITY_TAG_PREFIX));
      merged.push(SEVERITY_TAGS[sev]);
      merged.sort();

      if (JSON.stringify(merged) === JSON.stringify(existing)) continue;

      severityCounts[sev]++;

      if (!dry) {
        rewriteMirrorFrontmatterTags(relMirror, merged);
      }
      mirrorsTouched++;
    } catch (e) {
      process.stderr.write(`  ! ${scPath}: ${e.message}\n`);
    }
  }

  const summary = { filesScanned: sidecars.length, mirrorsTouched, severityCounts };
  process.stderr.write(JSON.stringify(summary) + '\n');
}

main();
