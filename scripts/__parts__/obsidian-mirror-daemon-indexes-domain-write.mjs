import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { join, relative, dirname, basename, extname } from 'node:path';

import {
  REPO_ROOT,
  SOURCE_MIRROR_DIR,
  MIRROR_FORMAT_VERSION,
  DIRTY_WORKSPACE_TAG,
  LOCAL_COMMIT_TAG,
  GRAPH_ACTION_REQUIRED_TAG,
  GRAPH_EVIDENCE_GAP_TAG,
  GRAPH_EFFECT_SECURITY_TAG,
  GRAPH_EFFECT_ERROR_TAG,
  GRAPH_EFFECT_ENTRYPOINT_TAG,
  GRAPH_EFFECT_DATA_TAG,
  GRAPH_EFFECT_NETWORK_TAG,
  GRAPH_EFFECT_ASYNC_TAG,
  GRAPH_EFFECT_STATE_TAG,
  GRAPH_EFFECT_CONTRACT_TAG,
  GRAPH_EFFECT_CONFIG_TAG,
  SIGNAL_STATIC_HIGH_TAG,
  SIGNAL_HOTSPOT_TAG,
  SIGNAL_EXTERNAL_TAG,
  GRAPH_RISK_CRITICAL_TAG,
  GRAPH_RISK_HIGH_TAG,
  GRAPH_PROOF_TEST_TAG,
  GRAPH_RUNTIME_API_TAG,
  GRAPH_SURFACE_UI_TAG,
  GRAPH_SURFACE_BACKEND_TAG,
  GRAPH_SURFACE_WORKER_TAG,
  GRAPH_SURFACE_SOURCE_TAG,
  GRAPH_GOVERNANCE_TAG,
  GRAPH_ORPHAN_TAG,
  GRAPH_MOLECULE_TAG,
  GRAPH_SECTOR_TAG,
  PULSE_MACHINE_TAG,
  METADATA_ONLY_TAG,
  GENERATED_PAGE_SIZE,
  GIT_STATE_DIR,
  DIRTY_DELETED_DIR,
  MACHINE_DIR,
  CAMERA_DIR,
  CLUSTER_DIR,
  VISUAL_FACT_DIR,
  WORKSPACE_DYNAMIC_DIR,
  WORKSPACE_DYNAMIC_NOTE,
} from '../obsidian-mirror-daemon-constants.mjs';

import {
  log,
  ensureDir,
  readManifest,
  writeManifest,
  withMirrorLock,
  normalizePath,
  sourceToMirrorPath,
  obsidianLink,
} from './obsidian-mirror-daemon-utils.mjs';

import {
  visualFactKey,
  visualFactLink,
  visualFactRelPath,
  visualFactTag,
  clusterKeyForSource,
  clusterTitleForKey,
  clusterRelPath,
  clusterLink,
  machineHubLink,
  slugSegment,
  shouldMaterializeVisualFact,
  isTestSource,
  buildMirrorSignalIndex,
} from './obsidian-mirror-daemon-content.mjs';


export function writeSignalNotes() {
  const signalRoot = join(SOURCE_MIRROR_DIR, '_signals');
  ensureDir(signalRoot);

  const signalEntries = [...buildMirrorSignalIndex().entries()]
    .filter(([, bucket]) => bucket.tags.size > 0 && bucket.details.length > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const expected = new Set();
  signalEntries.forEach(([source, bucket], index) => {
    const relPath = signalNotePath(source, index + 1);
    expected.add(normalizePath(relPath));
    writeGeneratedNote(relPath, buildSignalNote(source, bucket, index + 1));
  });

  for (const relPath of listGeneratedMarkdownRelPaths(signalRoot, '_signals')) {
    if (expected.has(relPath)) continue;
    try {
      unlinkSync(join(SOURCE_MIRROR_DIR, relPath));
    } catch (e) {
      log('WARN', `Cannot remove stale signal note ${relPath}:`, e.message);
    }
  }
}

export function writeDomainIndexes(manifest) {
  const entries = Object.values(manifest.files)
    .filter((entry) => entry.source)
    .sort((a, b) => a.source.localeCompare(b.source));
  const domains = new Map();
  for (const entry of entries) {
    const domain = domainForSource(entry.source);
    const bucket = domains.get(domain) || [];
    bucket.push(entry);
    domains.set(domain, bucket);
  }

  const expected = new Set(['INDEX.md']);
  writeGeneratedNote('INDEX.md', buildGeneratedIndex(manifest));

  for (const [domain, domainEntries] of [...domains.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const domainRel = normalizePath(join('_domains', `${domain}.md`));
    expected.add(domainRel);
    writeGeneratedNote(domainRel, buildDomainNote(domain, domainEntries));

    const pages = paginate(domainEntries);
    pages.forEach((pageEntries, index) => {
      const pageRel = normalizePath(domainPageRelPath(domain, index + 1));
      expected.add(pageRel);
      writeGeneratedNote(
        pageRel,
        buildDomainPageNote(domain, pageEntries, index + 1, pages.length),
      );
    });
  }

  const domainRoot = join(SOURCE_MIRROR_DIR, '_domains');
  for (const relPath of listGeneratedMarkdownRelPaths(domainRoot, '_domains')) {
    if (expected.has(relPath)) continue;
    try {
      unlinkSync(join(SOURCE_MIRROR_DIR, relPath));
    } catch (e) {
      log('WARN', `Cannot remove stale domain note ${relPath}:`, e.message);
    }
  }
}

export function domainForSource(sourcePath) {
  const [first, second] = normalizePath(sourcePath).split('/');
  if (!second) return 'root';
  if (first === '.') return 'root';
  return first;
}

export function domainNoteLink(domain) {
  return obsidianLink(join(SOURCE_MIRROR_DIR, '_domains', `${domain}.md`), domain);
}

export function sourceEntryLink(entry) {
  return obsidianLink(sourceToMirrorPath(join(REPO_ROOT, entry.source)), basename(entry.source));
}

export function plainDomainLabel(domain) {
  return `\`${domain}\``;
}

export function plainSourceLabel(entry) {
  return `\`${entry.source}\``;
}

export function sourceMirrorExistsInManifest(manifest, source) {
  return Object.values(manifest.files).some((entry) => entry.source === source);
}

export function dirtyDeletedNoteRelPath(source) {
  return join(DIRTY_DELETED_DIR, `${source}.md`);
}

export function buildDirtyDeletedNote(source) {
  return [
    '---',
    'tipo: espelho-git-dirty',
    'status: DIRTY',
    `source: ${source}`,
    `repo_root: ${REPO_ROOT}`,
    `mirror_format: ${MIRROR_FORMAT_VERSION}`,
    'git_dirty: true',
    'git_local_commit: false',
    'workspace_state: DIRTY_DELETED',
    'tags:',
    `  - ${DIRTY_WORKSPACE_TAG}`,
    `generated: ${new Date().toISOString()}`,
    '---',
    '',
    '# Arquivo removido com diff nao commitado',
    '',
    `Source: \`${source}\``,
    '',
    DIRTY_WORKSPACE_TAG.startsWith('#') ? DIRTY_WORKSPACE_TAG : `#${DIRTY_WORKSPACE_TAG}`,
    '',
    'Este no existe para representar um arquivo removido enquanto a delecao ainda nao foi commitada.',
    '',
  ].join('\n');
}

export function buildGeneratedIndex(manifest) {
  const entries = Object.values(manifest.files)
    .filter((entry) => entry.source)
    .sort((a, b) => a.source.localeCompare(b.source));
  const domains = new Map();
  for (const entry of entries) {
    const domain = domainForSource(entry.source);
    domains.set(domain, (domains.get(domain) || 0) + 1);
  }

  return [
    '---',
    'tipo: espelho-dinamico',
    'status: SINCRONIZADO',
    `repo_root: ${REPO_ROOT}`,
    `mirror_format: ${MIRROR_FORMAT_VERSION}`,
    `total_sources: ${entries.length}`,
    `generated: ${new Date().toISOString()}`,
    '---',
    '',
    '# Workspace completo',
    '',
    `Repo: \`${REPO_ROOT}\``,
    '',
    '## Dominios',
    '',
    ...[...domains.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([domain, count]) => `- ${domainNoteLink(domain)} (${count})`),
    '',
  ].join('\n');
}

