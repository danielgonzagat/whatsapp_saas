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


export function writeMachineIndexes(manifest) {
  const entries = Object.values(manifest.files)
    .filter((entry) => entry.source)
    .sort((a, b) => a.source.localeCompare(b.source));
  const incoming = buildIncomingCount(entries);
  const categories = [
    {
      key: 'workspace-sujo',
      title: 'Workspace sujo',
      description:
        'Arquivos tocados e ainda nao commitados. Amarelo e prioridade absoluta para multiagentes nao se sobreporem.',
      tags: [DIRTY_WORKSPACE_TAG],
      entries: entries.filter((entry) => entry.git_dirty),
    },
    {
      key: 'risco-critico',
      title: 'Risco critico',
      description:
        'Superficies onde erro pode quebrar dinheiro, auth, dados, governanca, CI/CD ou contratos centrais.',
      tags: [GRAPH_RISK_CRITICAL_TAG],
      entries: entries.filter((entry) => entry.machine_risk === 'critical'),
    },
    {
      key: 'risco-alto',
      title: 'Risco alto',
      description:
        'Superficies operacionais sensiveis: WhatsApp, filas, provedores externos e automacoes runtime.',
      tags: [GRAPH_RISK_HIGH_TAG],
      entries: entries.filter((entry) => entry.machine_risk === 'high'),
    },
    {
      key: 'runtime-api',
      title: 'Runtime API',
      description: 'Controllers, rotas e superficies HTTP/runtime expostas pela maquina.',
      tags: [GRAPH_RUNTIME_API_TAG],
      entries: entries.filter((entry) => (entry.machine_kinds || []).includes('api-controller')),
    },
    {
      key: 'ui-frontend',
      title: 'UI frontend',
      description: 'Telas, componentes e rotas que materializam a maquina para humanos.',
      tags: [GRAPH_SURFACE_UI_TAG],
      entries: entries.filter((entry) => entry.machine_surface === 'frontend'),
    },
    {
      key: 'provas-testes',
      title: 'Provas e testes',
      description: 'Arquivos de teste e validacao que provam comportamento da maquina.',
      tags: [GRAPH_PROOF_TEST_TAG],
      entries: entries.filter((entry) => (entry.machine_kinds || []).includes('test')),
    },
    {
      key: 'pulse-maquina',
      title: 'PULSE maquina',
      description: 'Arquivos da maquina PULSE e artefatos de autonomia/observabilidade.',
      tags: [PULSE_MACHINE_TAG, GRAPH_GOVERNANCE_TAG],
      entries: entries.filter((entry) => entry.machine_surface === 'pulse-machine'),
    },
    {
      key: 'governanca',
      title: 'Governanca',
      description:
        'Guardrails, contratos e superficies protegidas que impedem gambiarra e perda de controle.',
      tags: [GRAPH_GOVERNANCE_TAG],
      entries: entries.filter((entry) => entry.machine_surface === 'governance'),
    },
    {
      key: 'ilhas-sem-conexao',
      title: 'Ilhas sem conexao',
      description:
        'Arquivos sem arestas internas detectadas nem entrada conhecida. Podem ser folhas legitimas, debt ou codigo invisivel para o grafo.',
      tags: [GRAPH_ORPHAN_TAG],
      entries: entries.filter(
        (entry) => (entry.internal_links || 0) === 0 && (incoming.get(entry.source) || 0) === 0,
      ),
    },
  ];

  const expected = new Set();
  const mainRel = normalizePath(join(MACHINE_DIR, 'MAQUINA.md'));
  expected.add(mainRel);
  writeGeneratedNote(mainRel, buildMachineMainNote(categories));
  for (const category of categories) {
    writeMachineCategory(
      expected,
      category.key,
      category.title,
      category.description,
      category.tags,
      category.entries,
    );
  }

  const machineRoot = join(SOURCE_MIRROR_DIR, MACHINE_DIR);
  for (const relPath of listGeneratedMarkdownRelPaths(machineRoot, MACHINE_DIR)) {
    if (expected.has(relPath)) continue;
    try {
      unlinkSync(join(SOURCE_MIRROR_DIR, relPath));
    } catch (e) {
      log('WARN', `Cannot remove stale machine note ${relPath}:`, e.message);
    }
  }
}

export function buildClusterIndexes(entries) {
  const clusters = new Map();
  for (const entry of entries) {
    const key = entry.machine_cluster || clusterKeyForSource(entry.source);
    let cluster = clusters.get(key);
    if (!cluster) {
      cluster = { key, entries: [], linksTo: new Set() };
      clusters.set(key, cluster);
    }
    cluster.entries.push(entry);
  }

  for (const cluster of clusters.values()) {
    for (const entry of cluster.entries) {
      for (const target of entry.links_to || []) {
        const targetKey = clusters.has(clusterKeyForSource(target))
          ? clusterKeyForSource(target)
          : null;
        if (targetKey && targetKey !== cluster.key) {
          cluster.linksTo.add(targetKey);
        }
      }
    }
  }
  return clusters;
}

export function buildClusterNote(cluster, clusters) {
  const sorted = [...cluster.entries].sort((a, b) => a.source.localeCompare(b.source));
  const linkedClusters = [...cluster.linksTo].filter((key) => clusters.has(key)).sort();
  return [
    '---',
    'tipo: molecula-codigo',
    `cluster: ${cluster.key}`,
    `total_sources: ${sorted.length}`,
    `total_cluster_links: ${linkedClusters.length}`,
    `generated: ${new Date().toISOString()}`,
    'tags:',
    `  - ${GRAPH_MOLECULE_TAG}`,
    '---',
    '',
    `# ${clusterTitleForKey(cluster.key)}`,
    '',
    '## Pontes para outras moleculas',
    '',
    ...(linkedClusters.length
      ? linkedClusters.map((key) => `- ${clusterLink(key)}`)
      : ['Nenhuma ponte externa detectada.']),
    '',
    '## Arquivos desta molecula',
    '',
    ...sorted.map((entry) => `- ${sourceEntryLink(entry)} \`${entry.source}\``),
    '',
  ].join('\n');
}

export function writeClusterIndexes(manifest) {
  const entries = Object.values(manifest.files)
    .filter((entry) => entry.source)
    .sort((a, b) => a.source.localeCompare(b.source));
  const clusters = buildClusterIndexes(entries);
  const expected = new Set();
  for (const cluster of [...clusters.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    const relPath = normalizePath(clusterRelPath(cluster.key));
    expected.add(relPath);
    writeGeneratedNote(relPath, buildClusterNote(cluster, clusters));
  }

  const clusterRoot = join(SOURCE_MIRROR_DIR, CLUSTER_DIR);
  for (const relPath of listGeneratedMarkdownRelPaths(clusterRoot, CLUSTER_DIR)) {
    if (expected.has(relPath)) continue;
    try {
      unlinkSync(join(SOURCE_MIRROR_DIR, relPath));
    } catch (e) {
      log('WARN', `Cannot remove stale cluster note ${relPath}:`, e.message);
    }
  }
}

