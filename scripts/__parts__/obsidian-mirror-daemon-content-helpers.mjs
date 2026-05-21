import {
  existsSync,
  statSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, relative, dirname, basename, extname, resolve } from 'node:path';

import {
  REPO_ROOT,
  SOURCE_MIRROR_DIR,
  MIRROR_FORMAT_VERSION,
  SOURCE_BODY_MIRROR_MAX_BYTES,
  DIRTY_WORKSPACE_TAG,
  LOCAL_COMMIT_TAG,
  METADATA_ONLY_TAG,
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
  PULSE_MACHINE_TAG,
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
  CLUSTER_DIR,
  MACHINE_DIR,
  CAMERA_DIR,
  VISUAL_FACT_DIR,
  OBRA_DIR,
} from '../obsidian-mirror-daemon-constants.mjs';

import {
  log,
  sha256,
  normalizePath,
  collectAllSourceFiles,
  sourceToMirrorPath,
  mirrorToSourcePath,
  sourceRelToMirrorRel,
  mirrorVisibleSegment,
  obsidianLink,
  obsidianLinkTarget,
  detectLanguage,
  isMirrorableSourceFile,
  ensureDir,
  readManifest,
  writeManifest,
  readGitDirtySources,
  readGitLocalCommitSources,
  gitStateForSource,
} from './obsidian-mirror-daemon-utils.mjs';

export function shouldExtractArchitecturalRelations(sourcePath) {
  const ext = extname(sourcePath).toLowerCase();
  return ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.prisma', '.sql'].includes(
    ext,
  );
}

export function buildRelationsSection(relations) {
  if (relations.length === 0) {
    return ['## Conexoes do codigo', '', 'Nenhuma conexao interna detectada.', ''];
  }

  return [
    '## Conexoes do codigo',
    '',
    ...relations.map((relation) => `- ${relation.link} via \`${relation.specifier}\``),
    '',
  ];
}

export function clusterKeyForSource(relPath) {
  const parts = normalizePath(relPath).split('/');
  if (parts[0] === 'backend' && parts[1] === 'src') {
    return ['backend', parts[2] || 'root'].join('__');
  }
  if (parts[0] === 'frontend' && parts[1] === 'src') {
    if (parts[2] === 'app')
      return ['frontend', 'app', parts[3] || 'root', parts[4] || 'index'].join('__');
    if (parts[2] === 'components')
      return ['frontend', 'components', parts[3] || 'root', parts[4] || 'index'].join('__');
    return ['frontend', parts[2] || 'src', parts[3] || 'index'].join('__');
  }
  if (parts[0] === 'worker') {
    return ['worker', parts[1] || 'root'].join('__');
  }
  if (parts[0] === 'scripts')
    return ['scripts', parts[1] || 'root', parts[2] || 'index'].join('__');
  if (parts[0] === '.pulse') return ['pulse-artifacts', parts[1] || 'root'].join('__');
  if (parts[0] === '.agents') return ['agents', parts[1] || 'root', parts[2] || 'index'].join('__');
  if (parts[0] === 'docs') return ['docs', parts[1] || 'root'].join('__');
  if (parts[0] === 'prisma' || parts[1] === 'prisma') return ['database', parts[0]].join('__');
  return [parts[0] || 'root', parts[1] || 'root'].join('__');
}

export function clusterTitleForKey(key) {
  return key
    .split('__')
    .filter(Boolean)
    .map((part) => part.replace(/[()]/g, '').replace(/[-_]+/g, ' '))
    .join(' / ');
}

export function clusterRelPath(key) {
  return join(CLUSTER_DIR, `${key}.md`);
}

export function clusterLink(key) {
  return obsidianLink(join(SOURCE_MIRROR_DIR, clusterRelPath(key)), clusterTitleForKey(key));
}

export function machineHubLink(key, alias) {
  return obsidianLink(join(SOURCE_MIRROR_DIR, MACHINE_DIR, `${key}.md`), alias);
}

export function slugSegment(value) {
  return (
    String(value || 'unknown')
      .toLowerCase()
      .replace(/[^a-z0-9._/-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'unknown'
  );
}

export function visualFactRelPath(fact) {
  return join(VISUAL_FACT_DIR, slugSegment(fact.kind), `${slugSegment(fact.value)}.md`);
}

export function visualFactKey(fact) {
  return `${fact.kind}:${fact.value}`;
}

export function visualFactLink(fact) {
  return obsidianLink(join(SOURCE_MIRROR_DIR, visualFactRelPath(fact)), fact.label || fact.value);
}

export function shouldMaterializeVisualFact(fact) {
  return [
    'problem',
    'missing',
    'debt',
    'architecture',
    'flow',
    'computational-effect',
    'effect-intensity',
    'surface',
    'risk',
    'kind',
    'route',
    'api-call',
    'db-op',
    'schema',
    'auth',
    'integration',
    'proof',
  ].includes(fact.kind);
}

