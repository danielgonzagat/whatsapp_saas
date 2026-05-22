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


export function domainPageRelPath(domain, pageIndex) {
  return join('_domains', '_pages', domain, `${String(pageIndex).padStart(3, '0')}.md`);
}

export function paginate(entries, pageSize = GENERATED_PAGE_SIZE) {
  const pages = [];
  for (let index = 0; index < entries.length; index += pageSize) {
    pages.push(entries.slice(index, index + pageSize));
  }
  return pages.length ? pages : [[]];
}

export function buildDomainNote(domain, entries) {
  const sorted = entries.sort((a, b) => a.source.localeCompare(b.source));
  const pages = paginate(sorted);
  return [
    '---',
    'tipo: espelho-dominio',
    'status: SINCRONIZADO',
    `dominio: ${domain}`,
    `total_sources: ${sorted.length}`,
    `pages: ${pages.length}`,
    `generated: ${new Date().toISOString()}`,
    '---',
    '',
    `# ${domain}`,
    '',
    ...pages.map((page, index) => {
      const first = page[0]?.source || 'vazio';
      const last = page[page.length - 1]?.source || 'vazio';
      const pageRel = domainPageRelPath(domain, index + 1);
      return `- ${obsidianLink(join(SOURCE_MIRROR_DIR, pageRel), `${domain} ${index + 1}`)} (${page.length}) \`${first}\` -> \`${last}\``;
    }),
    '',
    'Este no mantem o dominio navegavel sem criar um hub unico com milhares de arestas.',
    '',
  ].join('\n');
}

export function buildDomainPageNote(domain, pageEntries, pageIndex, totalPages) {
  const sorted = pageEntries.sort((a, b) => a.source.localeCompare(b.source));
  return [
    '---',
    'tipo: espelho-dominio-pagina',
    'status: SINCRONIZADO',
    `dominio: ${domain}`,
    `page: ${pageIndex}`,
    `pages: ${totalPages}`,
    `total_sources: ${sorted.length}`,
    `generated: ${new Date().toISOString()}`,
    '---',
    '',
    `# ${domain} / pagina ${pageIndex}`,
    '',
    `Dominio: ${domainNoteLink(domain)}`,
    '',
    ...sorted.map((entry) => `- ${sourceEntryLink(entry)} \`${entry.source}\``),
    '',
  ].join('\n');
}

export function machineHubRelPath(key) {
  return join(MACHINE_DIR, `${key}.md`);
}

export function machinePageRelPath(key, pageIndex) {
  return join(MACHINE_DIR, '_pages', key, `${String(pageIndex).padStart(3, '0')}.md`);
}

export function entryTags(entry) {
  return Array.isArray(entry.machine_tags) ? entry.machine_tags : [];
}

export function entryHasTag(entry, tag) {
  return (
    entryTags(entry).includes(tag) ||
    (tag === DIRTY_WORKSPACE_TAG && entry.git_dirty) ||
    (tag === LOCAL_COMMIT_TAG && entry.git_local_commit)
  );
}

export function buildIncomingCount(entries) {
  const incoming = new Map();
  for (const entry of entries) incoming.set(entry.source, 0);
  for (const entry of entries) {
    for (const target of entry.links_to || []) {
      incoming.set(target, (incoming.get(target) || 0) + 1);
    }
  }
  return incoming;
}

export function buildMachineHubNote(key, title, description, tags, entries) {
  const sorted = [...entries].sort((a, b) => a.source.localeCompare(b.source));
  const pages = paginate(sorted);
  const activeTags = tags.filter((tag) => sorted.some((entry) => entryHasTag(entry, tag)));
  return [
    '---',
    'tipo: maquina-codigo',
    `machine_key: ${key}`,
    `total_sources: ${sorted.length}`,
    `pages: ${pages.length}`,
    `generated: ${new Date().toISOString()}`,
    'tags:',
    `  - ${GRAPH_SECTOR_TAG}`,
    ...activeTags.map((tag) => `  - ${tag}`),
    '---',
    '',
    `# ${title}`,
    '',
    description,
    '',
    ...pages.map((page, index) => {
      const first = page[0]?.source || 'vazio';
      const last = page[page.length - 1]?.source || 'vazio';
      const relPath = machinePageRelPath(key, index + 1);
      return `- ${obsidianLink(join(SOURCE_MIRROR_DIR, relPath), `${title} ${index + 1}`)} (${page.length}) \`${first}\` -> \`${last}\``;
    }),
    '',
  ].join('\n');
}

export function buildMachinePageNote(key, title, tags, pageEntries, pageIndex, totalPages) {
  const sorted = [...pageEntries].sort((a, b) => a.source.localeCompare(b.source));
  const activeTags = tags.filter((tag) => sorted.some((entry) => entryHasTag(entry, tag)));
  return [
    '---',
    'tipo: maquina-codigo-pagina',
    `machine_key: ${key}`,
    `page: ${pageIndex}`,
    `pages: ${totalPages}`,
    `total_sources: ${sorted.length}`,
    `generated: ${new Date().toISOString()}`,
    'tags:',
    `  - ${GRAPH_SECTOR_TAG}`,
    ...activeTags.map((tag) => `  - ${tag}`),
    '---',
    '',
    `# ${title} / pagina ${pageIndex}`,
    '',
    `Mapa: ${obsidianLink(join(SOURCE_MIRROR_DIR, machineHubRelPath(key)), title)}`,
    '',
    ...sorted.map((entry) => {
      const state = entry.workspace_state || 'NO_LOCAL_DIFF';
      const risk = entry.machine_risk || 'normal';
      const kinds = (entry.machine_kinds || []).join(', ') || 'source';
      return `- ${sourceEntryLink(entry)} \`${entry.source}\` | \`${state}\` | \`${risk}\` | \`${kinds}\``;
    }),
    '',
  ].join('\n');
}

export function writeMachineCategory(expected, key, title, description, tags, entries) {
  const sorted = [...entries].sort((a, b) => a.source.localeCompare(b.source));
  const hubRel = normalizePath(machineHubRelPath(key));
  expected.add(hubRel);
  writeGeneratedNote(hubRel, buildMachineHubNote(key, title, description, tags, sorted));

  const pages = paginate(sorted);
  pages.forEach((page, index) => {
    const pageRel = normalizePath(machinePageRelPath(key, index + 1));
    expected.add(pageRel);
    writeGeneratedNote(
      pageRel,
      buildMachinePageNote(key, title, tags, page, index + 1, pages.length),
    );
  });
}

export function buildMachineMainNote(categories) {
  const totalSources = categories.reduce((sum, category) => sum + category.entries.length, 0);
  return [
    '---',
    'tipo: maquina-codigo-raiz',
    `repo_root: ${REPO_ROOT}`,
    `total_views: ${categories.length}`,
    `total_category_memberships: ${totalSources}`,
    `generated: ${new Date().toISOString()}`,
    'tags:',
    `  - ${GRAPH_SECTOR_TAG}`,
    '---',
    '',
    '# Maquina materializada',
    '',
    'Este e o indice operacional do unico Graph interativo do Obsidian: arquivos reais, estados reais, risco real, provas reais e superficies reais.',
    '',
    ...categories.map(
      (category) =>
        `- ${obsidianLink(join(SOURCE_MIRROR_DIR, machineHubRelPath(category.key)), category.title)} (${category.entries.length})`,
    ),
    '',
  ].join('\n');
}

