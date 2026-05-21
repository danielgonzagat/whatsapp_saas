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


export function normalizeGeneratedNoteForCompare(content) {
  return content.replace(/^generated: .+$/gm, 'generated: <stable>');
}

export function writeGeneratedNote(relPath, content) {
  const fullPath = join(SOURCE_MIRROR_DIR, relPath);
  ensureDir(dirname(fullPath));
  if (
    existsSync(fullPath) &&
    normalizeGeneratedNoteForCompare(readFileSync(fullPath, 'utf8')) ===
      normalizeGeneratedNoteForCompare(content)
  ) {
    return false;
  }
  const tmp = fullPath + '.tmp';
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, fullPath);
  return true;
}

export function rewriteMirrorFrontmatterTags(relMirror, tags) {
  const fullPath = join(SOURCE_MIRROR_DIR, relMirror);
  if (!existsSync(fullPath)) {
    return false;
  }

  const content = readFileSync(fullPath, 'utf8');
  if (!content.startsWith('---\n')) {
    return false;
  }

  const end = content.indexOf('\n---\n', 4);
  if (end === -1) {
    return false;
  }

  const frontmatter = content.slice(4, end).split('\n');
  const body = content.slice(end);
  const nextFrontmatter = [];
  let inserted = false;

  for (let index = 0; index < frontmatter.length; index++) {
    const line = frontmatter[index];
    if (line === 'tags:') {
      while (frontmatter[index + 1]?.startsWith('  - ')) {
        index++;
      }
      continue;
    }

    if (!inserted && line.startsWith('mirrored:')) {
      nextFrontmatter.push('tags:', ...tags.map((tag) => `  - ${tag}`));
      inserted = true;
    }

    nextFrontmatter.push(line);
  }

  if (!inserted) {
    nextFrontmatter.push('tags:', ...tags.map((tag) => `  - ${tag}`));
  }

  const next = `---\n${nextFrontmatter.join('\n')}${body}`;
  if (next === content) {
    return false;
  }

  const tmp = `${fullPath}.tmp`;
  writeFileSync(tmp, next, 'utf8');
  renameSync(tmp, fullPath);
  return true;
}

export function applyGraphDerivedTags(manifest) {
  const incoming = new Map();
  for (const entry of Object.values(manifest.files)) {
    for (const target of entry.links_to || []) {
      incoming.set(target, (incoming.get(target) || 0) + 1);
    }
  }

  let changed = 0;
  for (const [relMirror, entry] of Object.entries(manifest.files)) {
    const hasNoOutbound = (entry.internal_links || 0) === 0;
    const hasNoInbound = (incoming.get(entry.source) || 0) === 0;
    const tags = new Set(entry.machine_tags || []);

    if (hasNoInbound && hasNoOutbound) {
      tags.add(GRAPH_ORPHAN_TAG);
    } else {
      tags.delete(GRAPH_ORPHAN_TAG);
    }

    const nextTags = [...tags];
    if (JSON.stringify(nextTags) === JSON.stringify(entry.machine_tags || [])) {
      continue;
    }

    entry.machine_tags = nextTags;
    if (rewriteMirrorFrontmatterTags(relMirror, nextTags)) {
      changed++;
    }
  }

  if (changed > 0) {
    log('OK', `Graph derived file tags applied to ${changed} source points.`);
  }
}

// ── Light diagnostic tagging (manifest-only, zero overlay notes) ─────────────
// Re-enables the "what to do" signal that the heavy writeGeneratedIndexes path
// (disabled for bloat) used to provide — but derived purely from manifest
// fields, so it paints #graph/action-required / #graph/evidence-gap onto the
// EXISTING source notes without generating a single extra note.

export function listGeneratedMarkdownRelPaths(rootDir, relPrefix) {
  if (!existsSync(rootDir)) {
    return [];
  }
  const paths = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    let items;
    try {
      items = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const item of items) {
      const full = join(dir, item.name);
      if (item.isDirectory()) {
        stack.push(full);
      } else if (item.isFile() && item.name.endsWith('.md')) {
        paths.push(normalizePath(join(relPrefix, relative(rootDir, full))));
      }
    }
  }
  return paths;
}

export function listAllSourceMirrorMarkdownRelPaths() {
  if (!existsSync(SOURCE_MIRROR_DIR)) {
    return [];
  }
  const paths = [];
  const stack = [SOURCE_MIRROR_DIR];
  while (stack.length > 0) {
    const dir = stack.pop();
    let items;
    try {
      items = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const item of items) {
      const full = join(dir, item.name);
      if (item.isDirectory()) {
        stack.push(full);
      } else if (item.isFile() && item.name.endsWith('.md')) {
        paths.push(normalizePath(relative(SOURCE_MIRROR_DIR, full)));
      }
    }
  }
  return paths;
}

export function cleanupStaleMirrorFiles(manifest) {
  const expected = new Set(Object.keys(manifest.files).map(normalizePath));
  let removed = 0;
  for (const relPath of listAllSourceMirrorMarkdownRelPaths()) {
    if (expected.has(relPath)) continue;
    try {
      unlinkSync(join(SOURCE_MIRROR_DIR, relPath));
      removed++;
    } catch (e) {
      log('WARN', `Cannot remove stale mirror file ${relPath}:`, e.message);
    }
  }
  return removed;
}

export function signalNotePath(source, index) {
  const safeSource = normalizePath(source)
    .replace(/[^a-zA-Z0-9._/-]/g, '-')
    .replace(/\//g, '__');
  return join('_signals', `${String(index).padStart(3, '0')}__${safeSource}.md`);
}

export function buildSignalNote(source, bucket, index) {
  const tags = [...bucket.tags].sort();
  return [
    '---',
    'tipo: sinal-operacional',
    `source: ${source}`,
    `generated: ${new Date().toISOString()}`,
    ...(tags.length ? ['tags:', ...tags.map((tag) => `  - ${tag}`)] : []),
    '---',
    '',
    `# Sinal: ${source}`,
    '',
    `Arquivo afetado: ${obsidianLink(sourceToMirrorPath(join(REPO_ROOT, source)), basename(source))}`,
    '',
    '## Evidencias',
    '',
    ...bucket.details.slice(0, 12).map((detail) => `- ${detail}`),
    '',
  ].join('\n');
}

// visualFactTag imported from obsidian-mirror-daemon-content.mjs

export function buildVisualFactNote(fact, sources) {
  const tag = visualFactTag(fact);
  const uniqueSources = [...new Set(sources)].sort();
  const tags = [...new Set([tag || GRAPH_MOLECULE_TAG, GRAPH_MOLECULE_TAG].filter(Boolean))];
  return [
    '---',
    'tipo: comportamento-visual-do-codigo',
    `kind: ${fact.kind}`,
    `value: ${fact.value}`,
    `source_count: ${uniqueSources.length}`,
    'tags:',
    ...tags.map((item) => `  - ${item}`),
    `generated: ${new Date().toISOString()}`,
    '---',
    '',
    `# ${fact.label || fact.value}`,
    '',
    'Fato visual emitido automaticamente pelo conteudo do codigo.',
    '',
    '## Arquivos que emitem este comportamento',
    '',
    ...uniqueSources
      .slice(0, 400)
      .map((source) => `- ${obsidianLink(sourceToMirrorPath(join(REPO_ROOT, source)), source)}`),
    ...(uniqueSources.length > 400
      ? [`- ... ${uniqueSources.length - 400} arquivo(s) omitidos desta nota`]
      : []),
    '',
  ].join('\n');
}
