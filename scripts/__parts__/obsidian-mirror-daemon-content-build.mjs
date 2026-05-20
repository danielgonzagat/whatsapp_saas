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

export function shouldOmitSourceBody(sourcePath, sourceSize) {
  return sourceSize > SOURCE_BODY_MIRROR_MAX_BYTES;
}

export function buildMirrorContent(sourcePath, content) {
  const st = statSync(sourcePath);
  const raw = content ?? readFileSync(sourcePath, 'utf8');
  const lang = detectLanguage(sourcePath);
  const relPath = relative(REPO_ROOT, sourcePath);
  const omitSourceBody = shouldOmitSourceBody(sourcePath, st.size);
  const relations = extractInternalRelations(raw, sourcePath);
  const gitState = gitStateForSource(sourcePath);
  const sourceHash = sha256(raw);
  const signalInfo = buildMirrorSignalIndex().get(normalizePath(relPath));
  const machine = classifyMachineSource(normalizePath(relPath), raw);
  const clusterKey = clusterKeyForSource(normalizePath(relPath));
  const visualFacts = extractVisualFacts(
    sourcePath,
    raw,
    machine,
    gitState,
    relations,
    omitSourceBody,
  );
  const signalTags = [...(signalInfo?.tags || [])];
  const visualTags = visualFacts.map(visualFactTag).filter(Boolean);
  const tags = [
    ...(gitState.dirty ? [DIRTY_WORKSPACE_TAG] : []),
    ...sourceBaseTags(normalizePath(relPath), omitSourceBody),
    ...activeConstructionTags(machine, gitState, signalTags),
    ...visualTags,
    ...signalTags,
  ];
  const uniqueTags = [...new Set(tags)];

  const fence = lang || '';
  const lines = [
    `---`,
    `source: ${relPath}`,
    `repo_root: ${REPO_ROOT}`,
    `mirror_format: ${MIRROR_FORMAT_VERSION}`,
    `sha256: ${sourceHash}`,
    `bytes: ${st.size}`,
    `lang: ${lang || 'none'}`,
    `git_dirty: ${gitState.dirty ? 'true' : 'false'}`,
    `git_local_commit: ${gitState.localCommit ? 'true' : 'false'}`,
    `workspace_state: ${gitState.workspaceState}`,
    `mirror_payload: ${omitSourceBody ? 'metadata_only' : 'full_text'}`,
    `machine_surface: ${machine.surface}`,
    `machine_risk: ${machine.risk}`,
    `machine_cluster: ${clusterKey}`,
    ...(machine.kinds.length
      ? ['machine_kinds:', ...machine.kinds.map((kind) => `  - ${kind}`)]
      : []),
    ...(uniqueTags.length > 0 ? ['tags:', ...uniqueTags.map((tag) => `  - ${tag}`)] : []),
    `mirrored: ${new Date().toISOString()}`,
    `internal_links: ${relations.length}`,
    ...(visualFacts.length
      ? ['visual_facts:', ...visualFacts.map((fact) => `  - ${visualFactKey(fact)}`)]
      : []),
    `---`,
    ``,
    `> Source: \`${relPath}\``,
    `> Superficie: \`${machine.surface}\` | Risco: \`${machine.risk}\` | Tipo: \`${machine.kinds.join(', ') || 'source'}\``,
    ``,
    ...buildRelationsSection(relations),
    ...buildVisualFactsSection(visualFacts),
    ...(signalInfo?.details?.length
      ? ['## Sinais reais do codigo', '', ...signalInfo.details.map((detail) => `- ${detail}`), '']
      : []),
    ...(omitSourceBody
      ? [
          '## Payload',
          '',
          'Conteudo omitido do espelho interativo para manter o Obsidian leve.',
          '',
          `Arquivo original: \`${relPath}\``,
          `Bytes: ${st.size}`,
          `SHA-256: \`${sourceHash}\``,
        ]
      : ['```' + fence, raw, '```']),
    '',
  ];

  return lines.join('\n');
}
export function mirrorFile(sourcePath, manifest) {
  const mirrorPath = sourceToMirrorPath(sourcePath);
  const relSource = relative(REPO_ROOT, sourcePath);
  const sourceStat = statSync(sourcePath);

  let content;
  try {
    content = readFileSync(sourcePath, 'utf8');
  } catch (e) {
    log('ERR', `Cannot read source: ${relSource} — ${e.message}`);
    // Remove stale mirror if source can't be read
    if (existsSync(mirrorPath)) {
      unlinkSync(mirrorPath);
      delete manifest.files[relative(SOURCE_MIRROR_DIR, mirrorPath)];
    }
    return { status: 'error', reason: e.message };
  }

  const hash = sha256(content);
  const relMirror = relative(SOURCE_MIRROR_DIR, mirrorPath);
  const existing = manifest.files[relMirror];
  const gitState = gitStateForSource(sourcePath);

  const relations = extractInternalRelations(content, sourcePath);
  const machine = classifyMachineSource(normalizePath(relSource), content);
  const clusterKey = clusterKeyForSource(normalizePath(relSource));
  const visualFacts = extractVisualFacts(
    sourcePath,
    content,
    machine,
    gitState,
    relations,
    shouldOmitSourceBody(sourcePath, sourceStat.size),
  );
  const visualTags = visualFacts.map(visualFactTag).filter(Boolean);

  // Check if file is unchanged and already uses the current graph format.
  if (
    existing &&
    existing.hash === hash &&
    existing.format_version === MIRROR_FORMAT_VERSION &&
    existing.git_dirty === gitState.dirty &&
    existing.git_local_commit === gitState.localCommit &&
    existing.workspace_state === gitState.workspaceState
  ) {
    return { status: 'unchanged' };
  }

  // Build mirror markdown
  const mirrorContent = buildMirrorContent(sourcePath, content);

  // Atomic write
  ensureDir(dirname(mirrorPath));
  const tmp = mirrorPath + '.tmp';
  try {
    writeFileSync(tmp, mirrorContent, 'utf8');
    renameSync(tmp, mirrorPath);
  } catch (e) {
    log('ERR', `Cannot write mirror: ${relMirror} — ${e.message}`);
    try {
      unlinkSync(tmp);
    } catch {
      /* cleanup */
    }
    return { status: 'error', reason: e.message };
  }

  // Update manifest
  const st = statSync(mirrorPath);
  manifest.files[relMirror] = {
    source: relSource,
    hash,
    source_size: sourceStat.size,
    mirror_size: st.size,
    lang: detectLanguage(sourcePath) || 'none',
    git_dirty: gitState.dirty,
    git_local_commit: gitState.localCommit,
    workspace_state: gitState.workspaceState,
    mirror_payload: shouldOmitSourceBody(sourcePath, sourceStat.size)
      ? 'metadata_only'
      : 'full_text',
    machine_surface: machine.surface,
    machine_risk: machine.risk,
    machine_cluster: clusterKey,
    machine_kinds: machine.kinds,
    machine_tags: [
      ...new Set([
        ...sourceBaseTags(
          normalizePath(relSource),
          shouldOmitSourceBody(sourcePath, sourceStat.size),
        ),
        ...activeConstructionTags(machine, gitState),
        ...visualTags,
      ]),
    ],
    format_version: MIRROR_FORMAT_VERSION,
    internal_links: relations.length,
    links_to: relations.map((relation) => relation.source),
    visual_facts: visualFacts.map(visualFactKey),
    updated: new Date().toISOString(),
  };

  return { status: 'updated' };
}

// ── Visual Fact Tag Mapping ─────────────────────────────────────────────────
// NOTE: Also used by indexes module (re-imported there).

export function visualFactTag(fact) {
  if (fact.kind === 'debt') return SIGNAL_STATIC_HIGH_TAG;
  if (fact.kind === 'problem') return GRAPH_ACTION_REQUIRED_TAG;
  if (fact.kind === 'architecture') return SIGNAL_HOTSPOT_TAG;
  if (fact.kind === 'missing') return GRAPH_EVIDENCE_GAP_TAG;
  if (fact.kind === 'computational-effect') {
    if (fact.value === 'auth-or-isolation') return GRAPH_EFFECT_SECURITY_TAG;
    if (fact.value === 'http-server' || fact.value === 'service-logic')
      return GRAPH_EFFECT_ENTRYPOINT_TAG;
    if (
      fact.value === 'database-io' ||
      fact.value === 'database-read' ||
      fact.value === 'database-write'
    )
      return GRAPH_EFFECT_DATA_TAG;
    if (fact.value === 'network-io' || fact.value === 'external-provider')
      return GRAPH_EFFECT_NETWORK_TAG;
    if (fact.value === 'queue-work') return GRAPH_EFFECT_ASYNC_TAG;
    if (fact.value === 'ui-reactivity' || fact.value === 'browser-persistence')
      return GRAPH_EFFECT_STATE_TAG;
    if (fact.value === 'documentation-or-contract' || fact.value === 'type-contract-only')
      return GRAPH_EFFECT_CONTRACT_TAG;
    if (fact.value === 'configuration') return GRAPH_EFFECT_CONFIG_TAG;
    return SIGNAL_HOTSPOT_TAG;
  }
  if (fact.kind === 'effect-intensity') {
    if (String(fact.value).startsWith('async:')) return GRAPH_EFFECT_ASYNC_TAG;
    if (String(fact.value).startsWith('errors:')) return GRAPH_EFFECT_ERROR_TAG;
    return SIGNAL_HOTSPOT_TAG;
  }
  if (fact.kind === 'flow') return GRAPH_PROOF_TEST_TAG;
  if (fact.kind === 'risk' && fact.value === 'critical') return GRAPH_RISK_CRITICAL_TAG;
  if (fact.kind === 'risk' && fact.value === 'high') return GRAPH_RISK_HIGH_TAG;
  if (fact.kind === 'proof') return GRAPH_PROOF_TEST_TAG;
  if (fact.kind === 'route') return GRAPH_RUNTIME_API_TAG;
  if (fact.kind === 'api-call') return GRAPH_RUNTIME_API_TAG;
  if (fact.kind === 'db-op') return GRAPH_RISK_HIGH_TAG;
  if (fact.kind === 'schema') return GRAPH_RISK_CRITICAL_TAG;
  if (fact.kind === 'auth') return GRAPH_RISK_HIGH_TAG;
  if (fact.kind === 'integration') return SIGNAL_EXTERNAL_TAG;
  if (fact.kind === 'surface' && fact.value === 'frontend') return GRAPH_SURFACE_UI_TAG;
  if (fact.kind === 'surface' && fact.value === 'backend') return GRAPH_SURFACE_BACKEND_TAG;
  if (fact.kind === 'surface' && fact.value === 'worker') return GRAPH_SURFACE_WORKER_TAG;
  if (fact.kind === 'surface' && fact.value === 'source') return GRAPH_SURFACE_SOURCE_TAG;
  if (fact.kind === 'surface' && (fact.value === 'governance' || fact.value === 'pulse-machine'))
    return GRAPH_GOVERNANCE_TAG;
  if (fact.kind === 'git-state' && fact.value === 'dirty') return DIRTY_WORKSPACE_TAG;
  if (fact.kind === 'payload' && fact.value === 'metadata-only') return METADATA_ONLY_TAG;
  return null;
}
