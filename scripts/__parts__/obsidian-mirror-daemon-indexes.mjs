import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';

import {
  CLUSTER_DIR,
  MACHINE_DIR,
  MANIFEST_PATH,
  MIRROR_FORMAT_VERSION,
  MIRROR_ROOT,
  REPO_ROOT,
  SOURCE_MIRROR_DIR,
} from '../obsidian-mirror-daemon-constants.mjs';

import { normalizePath, obsidianLink, writeManifest } from './obsidian-mirror-daemon-utils.mjs';

function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function writeAtomicIfChanged(filePath, content) {
  ensureDir(dirname(filePath));
  if (existsSync(filePath) && readFileSync(filePath, 'utf8') === content) {
    return false;
  }
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, filePath);
  return true;
}

function notePath(relPath) {
  return join(SOURCE_MIRROR_DIR, relPath);
}

function machineHubNote(surface, entries) {
  const title = `Machine surface: ${surface}`;
  return [
    '---',
    `source: _generated/${MACHINE_DIR}/${surface}.md`,
    `repo_root: ${REPO_ROOT}`,
    `mirror_format: ${MIRROR_FORMAT_VERSION}`,
    'tags:',
    '  - mirror/metadata-only',
    '  - graph/molecule',
    '---',
    '',
    `# ${title}`,
    '',
    ...entries
      .slice(0, 300)
      .map(([relMirror, entry]) => `- ${obsidianLink(notePath(relMirror), entry.source)}`),
    '',
  ].join('\n');
}

function clusterNote(cluster, entries) {
  const title = cluster.replace(/__/g, ' / ');
  return [
    '---',
    `source: _generated/${CLUSTER_DIR}/${cluster}.md`,
    `repo_root: ${REPO_ROOT}`,
    `mirror_format: ${MIRROR_FORMAT_VERSION}`,
    'tags:',
    '  - mirror/metadata-only',
    '  - graph/molecule',
    '---',
    '',
    `# ${title}`,
    '',
    ...entries
      .slice(0, 300)
      .map(([relMirror, entry]) => `- ${obsidianLink(notePath(relMirror), entry.source)}`),
    '',
  ].join('\n');
}

function writeGeneratedIndexes(manifest) {
  const entries = Object.entries(manifest.files || {});
  const bySurface = new Map();
  const byCluster = new Map();
  for (const entry of entries) {
    const [, meta] = entry;
    const surface = meta.machine_surface || 'source';
    const cluster = meta.machine_cluster || 'unknown';
    if (!bySurface.has(surface)) {
      bySurface.set(surface, []);
    }
    if (!byCluster.has(cluster)) {
      byCluster.set(cluster, []);
    }
    bySurface.get(surface).push(entry);
    byCluster.get(cluster).push(entry);
  }

  // Generated index notes live OUTSIDE `_source/` (parent MIRROR_ROOT) to
  // satisfy `forbiddenGeneratedSourceDirs` in ops/kloel-ai-constitution.json.
  // Putting them inside `_source/` was the previous bug that tripped the
  // pre-push check-ai-constitution gate.
  for (const [surface, surfaceEntries] of bySurface) {
    writeAtomicIfChanged(join(MIRROR_ROOT, MACHINE_DIR, `${surface}.md`), machineHubNote(surface, surfaceEntries));
  }
  for (const [cluster, clusterEntries] of byCluster) {
    writeAtomicIfChanged(join(MIRROR_ROOT, CLUSTER_DIR, `${cluster}.md`), clusterNote(cluster, clusterEntries));
  }
}

export function persistManifestState(manifest) {
  manifest.version = manifest.version || 2;
  manifest.generated = new Date().toISOString();
  manifest.repo_root = REPO_ROOT;
  writeGeneratedIndexes(manifest);
  writeManifest(manifest);
}

export function cleanupStaleMirrorFiles(manifest) {
  const tracked = new Set(Object.keys(manifest.files || {}));
  let removed = 0;

  function visit(dirPath) {
    let entries;
    try {
      entries = readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (entry.name === 'manifest.json') {
        continue;
      }
      const rel = normalizePath(relative(SOURCE_MIRROR_DIR, fullPath));
      if (rel.startsWith(`${MACHINE_DIR}/`) || rel.startsWith(`${CLUSTER_DIR}/`)) {
        continue;
      }
      if (!tracked.has(rel)) {
        try {
          rmSync(fullPath);
          removed += 1;
        } catch {
          // Keep going; stale cleanup is best-effort.
        }
      }
    }
  }

  if (existsSync(SOURCE_MIRROR_DIR) && statSync(SOURCE_MIRROR_DIR).isDirectory()) {
    visit(SOURCE_MIRROR_DIR);
  }
  if (existsSync(MANIFEST_PATH)) {
    return removed;
  }
  return removed;
}
