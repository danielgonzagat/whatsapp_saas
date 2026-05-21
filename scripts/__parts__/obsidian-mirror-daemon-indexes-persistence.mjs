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


export function persistManifestState(manifest) {
  withMirrorLock('persist-mirror-state', () => {
    writeGeneratedIndexes(manifest);
    writeDynamicWorkspaceStatus(manifest);
    writeManifest(manifest);
  });
}

// ── Dynamic Workspace Sensor (ported forward from HEAD 02f9b9fcc) ────────────
function notePath(relPath) {
  return join(SOURCE_MIRROR_DIR, relPath);
}

function workspaceStateEntries(manifest, fieldName) {
  return Object.entries(manifest.files || {})
    .filter(([, entry]) => Boolean(entry[fieldName]))
    .sort((a, b) => a[1].source.localeCompare(b[1].source));
}

function recentlyUpdatedEntries(manifest) {
  return Object.entries(manifest.files || {})
    .filter(([, entry]) => entry.updated)
    .sort((a, b) => String(b[1].updated).localeCompare(String(a[1].updated)))
    .slice(0, 80);
}

function workspaceDynamicNote(manifest) {
  const entries = Object.entries(manifest.files || {});
  const dirty = workspaceStateEntries(manifest, 'git_dirty');
  const localCommit = workspaceStateEntries(manifest, 'git_local_commit');
  const recent = recentlyUpdatedEntries(manifest);
  const generatedAt = new Date().toISOString();
  const tags = ['mirror/metadata-only', 'graph/molecule'];
  if (dirty.length > 0) {
    tags.push(DIRTY_WORKSPACE_TAG);
  }
  if (localCommit.length > 0) {
    tags.push(LOCAL_COMMIT_TAG);
  }

  return [
    '---',
    `source: _generated/${WORKSPACE_DYNAMIC_DIR}/${WORKSPACE_DYNAMIC_NOTE}`,
    `repo_root: ${REPO_ROOT}`,
    `mirror_format: ${MIRROR_FORMAT_VERSION}`,
    'tags:',
    ...tags.map((tag) => `  - ${tag}`),
    `dynamic_mirror: true`,
    `mirrored: ${generatedAt}`,
    `tracked_files: ${entries.length}`,
    `dirty_files: ${dirty.length}`,
    `local_commit_files: ${localCommit.length}`,
    '---',
    '',
    '# Workspace Vivo',
    '',
    `Atualizado: ${generatedAt}`,
    '',
    'Este no e o sensor dinamico do workspace. Ele nao declara saude funcional; apenas reflete o estado atual do codigo espelhado, arquivos dirty e commits locais.',
    '',
    '## Dirty agora',
    '',
    ...(dirty.length
      ? dirty.slice(0, 200).map(([relMirror, entry]) => `- ${obsidianLink(notePath(relMirror), entry.source)}`)
      : ['Nenhum arquivo dirty no manifesto atual.']),
    '',
    '## Local commits',
    '',
    ...(localCommit.length
      ? localCommit.slice(0, 200).map(([relMirror, entry]) => `- ${obsidianLink(notePath(relMirror), entry.source)}`)
      : ['Nenhum arquivo em commit local no manifesto atual.']),
    '',
    '## Atualizados recentemente',
    '',
    ...recent.map(
      ([relMirror, entry]) =>
        `- ${obsidianLink(notePath(relMirror), entry.source)} - ${entry.workspace_state || 'NO_LOCAL_DIFF'} - ${entry.updated}`,
    ),
    '',
  ].join('\n');
}

export function writeDynamicWorkspaceStatus(manifest) {
  return writeGeneratedNote(
    `${WORKSPACE_DYNAMIC_DIR}/${WORKSPACE_DYNAMIC_NOTE}`,
    workspaceDynamicNote(manifest),
  );
}
