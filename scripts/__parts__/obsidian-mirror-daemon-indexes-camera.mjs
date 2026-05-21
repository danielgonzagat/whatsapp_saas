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


export function cameraRelPath(name) {
  return join(CAMERA_DIR, `${name}.md`);
}

export function buildCameraNote(name, title, tag, factBuckets, limit = 80) {
  const buckets = factBuckets
    .filter(Boolean)
    .filter((bucket) => bucket.sources.length > 0)
    .sort(
      (a, b) =>
        b.sources.length - a.sources.length ||
        visualFactKey(a.fact).localeCompare(visualFactKey(b.fact)),
    )
    .slice(0, limit);
  return [
    '---',
    'tipo: camera-computacional',
    `camera: ${name}`,
    `total_signals: ${buckets.length}`,
    `generated: ${new Date().toISOString()}`,
    'tags:',
    `  - ${tag}`,
    `  - ${GRAPH_SECTOR_TAG}`,
    '---',
    '',
    `# ${title}`,
    '',
    ...buckets.flatMap((bucket) => [
      `- ${visualFactLink(bucket.fact)} (${bucket.sources.length})`,
      ...bucket.sources
        .slice(0, 12)
        .map(
          (source) => `  - ${obsidianLink(sourceToMirrorPath(join(REPO_ROOT, source)), source)}`,
        ),
    ]),
    '',
  ].join('\n');
}

export function buildCameraRootNote(cameraNotes) {
  return [
    '---',
    'tipo: camera-computacional-raiz',
    `generated: ${new Date().toISOString()}`,
    'tags:',
    `  - ${GRAPH_SECTOR_TAG}`,
    '---',
    '',
    '# Camera da computacao',
    '',
    ...cameraNotes.map(
      (note) => `- ${obsidianLink(join(SOURCE_MIRROR_DIR, cameraRelPath(note.name)), note.title)}`,
    ),
    '',
  ].join('\n');
}

export function writeCameraIndexes(facts) {
  const buckets = [...facts.values()];
  const byKind = (kind) => buckets.filter((bucket) => bucket.fact.kind === kind);
  const byKinds = (...kinds) => buckets.filter((bucket) => kinds.includes(bucket.fact.kind));
  const cameraNotes = [
    {
      name: '00-problemas',
      title: 'Problemas que aparecem no print',
      tag: SIGNAL_STATIC_HIGH_TAG,
      buckets: byKinds('problem', 'missing', 'debt'),
    },
    {
      name: '01-arquitetura',
      title: 'Arquitetura e isolamento',
      tag: SIGNAL_HOTSPOT_TAG,
      buckets: byKind('architecture'),
    },
    {
      name: '02-fluxos-vivos',
      title: 'Fluxos vivos e comprovados',
      tag: GRAPH_PROOF_TEST_TAG,
      buckets: byKind('flow'),
    },
    {
      name: '03-efeito-computacional',
      title: 'Efeito computacional runtime',
      tag: SIGNAL_HOTSPOT_TAG,
      buckets: byKinds('computational-effect', 'effect-intensity'),
    },
    {
      name: '04-superficies',
      title: 'Superficies da maquina',
      tag: GRAPH_SECTOR_TAG,
      buckets: byKinds('surface', 'risk', 'kind'),
    },
    {
      name: '05-contratos',
      title: 'Contratos, rotas, schema e chamadas',
      tag: GRAPH_RUNTIME_API_TAG,
      buckets: byKinds('route', 'api-call', 'db-op', 'schema', 'auth', 'symbol'),
    },
  ];

  const expected = new Set([normalizePath(cameraRelPath('CAMERA'))]);
  writeGeneratedNote(cameraRelPath('CAMERA'), buildCameraRootNote(cameraNotes));
  for (const note of cameraNotes) {
    const relPath = normalizePath(cameraRelPath(note.name));
    expected.add(relPath);
    writeGeneratedNote(relPath, buildCameraNote(note.name, note.title, note.tag, note.buckets));
  }

  const cameraRoot = join(SOURCE_MIRROR_DIR, CAMERA_DIR);
  for (const relPath of listGeneratedMarkdownRelPaths(cameraRoot, CAMERA_DIR)) {
    if (expected.has(relPath)) continue;
    try {
      unlinkSync(join(SOURCE_MIRROR_DIR, relPath));
    } catch (e) {
      log('WARN', `Cannot remove stale camera note ${relPath}:`, e.message);
    }
  }
}

export function removeGeneratedGraphOverlays() {
  for (const dirName of [
    VISUAL_FACT_DIR,
    CAMERA_DIR,
    MACHINE_DIR,
    CLUSTER_DIR,
    '_signals',
    '_domains',
    '_git',
  ]) {
    const dirPath = join(SOURCE_MIRROR_DIR, dirName);
    if (!existsSync(dirPath)) continue;
    try {
      rmSync(dirPath, { recursive: true, force: true });
    } catch (e) {
      log('WARN', `Cannot remove generated graph overlay ${dirName}:`, e.message);
    }
  }
}

