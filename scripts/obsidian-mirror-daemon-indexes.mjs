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
} from './obsidian-mirror-daemon-constants.mjs';

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

export function writeGeneratedIndexes(manifest) {
  // Disabled: generated artifacts (_visual, _clusters, _signals, _machine, _domains) inflate Obsidian graph
  // with 29k+ non-source files. Only source-code mirror is needed for architectural diagnosis.
  removeGeneratedGraphOverlays();
  applyGraphDerivedTags(manifest);
  return;
  removeGeneratedGraphOverlays();
  applyGraphDerivedTags(manifest);
  writeSignalNotes();
  writeDomainIndexes(manifest);
  writeMachineIndexes(manifest);
  writeClusterIndexes(manifest);

  const facts = new Map();
  const entries = Object.values(manifest.files);
  const sourceSet = new Set(entries.map((entry) => entry.source));
  const incoming = new Map();
  for (const entry of entries) {
    for (const target of entry.links_to || []) {
      incoming.set(target, (incoming.get(target) || 0) + 1);
    }
  }
  const testSources = entries
    .filter((entry) => isTestSource(entry.source))
    .map((entry) => entry.source);
  const factsBySource = new Map();
  const factValuesByKind = (entry, kind) =>
    (factsBySource.get(entry.source) || [])
      .filter((fact) => fact.kind === kind)
      .map((fact) => fact.value);
  const addFactSource = (fact, source) => {
    const key = visualFactKey(fact);
    const bucket = facts.get(key) || {
      fact,
      sources: [],
    };
    bucket.sources.push(source);
    facts.set(key, bucket);
  };
  const parseEntryFacts = (entry) => {
    const parsed = [];
    for (const key of entry.visual_facts || []) {
      const [kind, ...valueParts] = String(key).split(':');
      const value = valueParts.join(':');
      if (!kind || !value) continue;
      parsed.push({
        kind,
        value,
        label: value,
      });
    }
    return parsed;
  };
  const hasNearbyTest = (entry) => {
    if (isTestSource(entry.source)) return true;
    const source = entry.source;
    const ext = extname(source);
    const withoutExt = ext ? source.slice(0, -ext.length) : source;
    const candidates = [
      `${withoutExt}.spec${ext}`,
      `${withoutExt}.test${ext}`,
      `${dirname(source)}/__tests__/${basename(withoutExt)}.spec${ext}`,
      `${dirname(source)}/__tests__/${basename(withoutExt)}.test${ext}`,
    ].map(normalizePath);
    if (candidates.some((candidate) => sourceSet.has(candidate))) return true;
    const stem = basename(withoutExt).replace(
      /\.(controller|service|module|dto|route|page|component)$/i,
      '',
    );
    return testSources.some((testSource) => testSource.includes(stem) && stem.length > 3);
  };
  const routePath = (value) => normalizeHttpPath(String(value || '').replace(/^[A-Z]+\s+/, ''));
  const backendRoutePaths = new Set();
  const frontendCallPaths = new Set();

  for (const entry of entries) {
    const parsed = parseEntryFacts(entry);
    factsBySource.set(entry.source, parsed);
    for (const fact of parsed) {
      if (fact.kind === 'route') backendRoutePaths.add(routePath(fact.value));
      if (fact.kind === 'api-call') frontendCallPaths.add(routePath(fact.value));
    }
  }

  for (const entry of entries) {
    for (const fact of factsBySource.get(entry.source) || []) {
      addFactSource(fact, entry.source);
    }

    const isExecutableSource =
      /^(backend\/src|frontend\/src|frontend-admin\/src|worker\/|scripts\/pulse\/)/.test(
        entry.source,
      ) && !isTestSource(entry.source);
    const isGeneratedRuntimeArtifact =
      /^(\.pulse|\.gitnexus|\.agents|\.kilo|\.omx|\.serena)\//.test(entry.source);
    const inboundCount = incoming.get(entry.source) || 0;
    const computationalEffects = new Set(factValuesByKind(entry, 'computational-effect'));
    const hasServiceDependency = (entry.links_to || []).some((target) =>
      /service\.[cm]?[jt]s$/.test(target),
    );
    const hasRuntimeSideEffect = [
      'database-io',
      'database-read',
      'database-write',
      'network-io',
      'browser-persistence',
      'queue-work',
      'external-provider',
      'http-server',
      'ui-reactivity',
    ].some((effect) => computationalEffects.has(effect));
    if (inboundCount === 0 && !isGeneratedRuntimeArtifact) {
      addFactSource(
        {
          kind: 'architecture',
          value: 'no-known-inbound-link',
          label: 'Sem entrada conhecida no grafo de codigo',
        },
        entry.source,
      );
    }
    if ((entry.internal_links || 0) === 0 && !isGeneratedRuntimeArtifact) {
      addFactSource(
        {
          kind: 'architecture',
          value: 'no-known-outbound-link',
          label: 'Sem saida conhecida no grafo de codigo',
        },
        entry.source,
      );
    }
    if (isExecutableSource && inboundCount === 0 && (entry.internal_links || 0) === 0) {
      addFactSource(
        {
          kind: 'architecture',
          value: 'isolated-code-island',
          label: 'Arquivo isolado sem entrada nem saida',
        },
        entry.source,
      );
    }
    if (isExecutableSource && !hasNearbyTest(entry)) {
      addFactSource(
        {
          kind: 'missing',
          value: 'nearby-test',
          label: 'Sem teste proximo detectado',
        },
        entry.source,
      );
    }
    if ((entry.machine_kinds || []).includes('api-controller') && !hasNearbyTest(entry)) {
      addFactSource(
        {
          kind: 'problem',
          value: 'api-controller-without-nearby-test',
          label: 'Controller API sem teste proximo',
        },
        entry.source,
      );
    }
    if (entry.machine_risk === 'critical' && !hasNearbyTest(entry)) {
      addFactSource(
        {
          kind: 'problem',
          value: 'critical-source-without-nearby-test',
          label: 'Superficie critica sem teste proximo',
        },
        entry.source,
      );
    }
    if (entry.git_dirty && entry.machine_risk === 'critical') {
      addFactSource(
        {
          kind: 'problem',
          value: 'dirty-critical-surface',
          label: 'Superficie critica suja',
        },
        entry.source,
      );
    }
    if (entry.mirror_payload === 'metadata_only' && isExecutableSource) {
      addFactSource(
        {
          kind: 'problem',
          value: 'executable-source-metadata-only',
          label: 'Codigo executavel sem payload completo no espelho',
        },
        entry.source,
      );
    }
    for (const route of entry.source.startsWith('backend/src/') &&
    (entry.machine_kinds || []).includes('api-controller')
      ? factValuesByKind(entry, 'route')
      : []) {
      if (!frontendCallPaths.has(routePath(route))) {
        addFactSource(
          {
            kind: 'problem',
            value: 'route-without-frontend-consumer',
            label: 'Rota backend sem consumidor frontend detectado',
          },
          entry.source,
        );
      } else {
        addFactSource(
          {
            kind: 'flow',
            value: 'backend-route-has-frontend-consumer',
            label: 'Rota backend consumida pelo frontend',
          },
          entry.source,
        );
      }
    }
    for (const call of entry.source.startsWith('frontend/src/')
      ? factValuesByKind(entry, 'api-call')
      : []) {
      if (!backendRoutePaths.has(routePath(call))) {
        addFactSource(
          {
            kind: 'problem',
            value: 'frontend-call-without-backend-route',
            label: 'Chamada frontend sem rota backend detectada',
          },
          entry.source,
        );
      } else {
        addFactSource(
          {
            kind: 'flow',
            value: 'frontend-call-has-backend-route',
            label: 'Chamada frontend encontra rota backend',
          },
          entry.source,
        );
      }
    }
    if (
      entry.source.startsWith('backend/src/') &&
      (entry.machine_kinds || []).includes('api-controller')
    ) {
      if (hasServiceDependency || computationalEffects.has('database-io')) {
        addFactSource(
          {
            kind: 'flow',
            value: 'controller-reaches-service-or-data',
            label: 'Controller alcanca service ou dados',
          },
          entry.source,
        );
      } else {
        addFactSource(
          {
            kind: 'problem',
            value: 'controller-without-visible-execution-chain',
            label: 'Controller sem cadeia visivel de execucao',
          },
          entry.source,
        );
      }
    }
    if (
      entry.source.startsWith('backend/src/') &&
      (entry.machine_kinds || []).includes('service')
    ) {
      if (hasRuntimeSideEffect) {
        addFactSource(
          {
            kind: 'flow',
            value: 'service-has-runtime-side-effect',
            label: 'Service tem efeito runtime visivel',
          },
          entry.source,
        );
      } else {
        addFactSource(
          {
            kind: 'problem',
            value: 'service-without-visible-runtime-effect',
            label: 'Service sem efeito runtime visivel',
          },
          entry.source,
        );
      }
    }
    if (
      entry.source.startsWith('frontend/src/') &&
      (entry.machine_kinds || []).includes('ui-component')
    ) {
      if (computationalEffects.has('ui-reactivity') || computationalEffects.has('network-io')) {
        addFactSource(
          {
            kind: 'flow',
            value: 'ui-has-state-or-io',
            label: 'UI tem estado ou I/O visivel',
          },
          entry.source,
        );
      } else {
        addFactSource(
          {
            kind: 'architecture',
            value: 'static-ui-shell',
            label: 'UI sem estado ou I/O visivel',
          },
          entry.source,
        );
      }
    }
    if (isTestSource(entry.source)) {
      if ((entry.internal_links || 0) > 0) {
        addFactSource(
          {
            kind: 'flow',
            value: 'proof-links-to-target',
            label: 'Prova/teste aponta para alvo',
          },
          entry.source,
        );
      } else {
        addFactSource(
          {
            kind: 'problem',
            value: 'proof-without-target-link',
            label: 'Prova/teste sem alvo visivel',
          },
          entry.source,
        );
      }
    }
    const dbOps = factValuesByKind(entry, 'db-op');
    const isDbWriter = dbOps.some((operation) =>
      /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)$/.test(operation),
    );
    if (isExecutableSource && isDbWriter && factValuesByKind(entry, 'isolation-key').length === 0) {
      addFactSource(
        {
          kind: 'problem',
          value: 'db-write-without-visible-tenant-key',
          label: 'Escrita DB sem chave de isolamento visivel',
        },
        entry.source,
      );
    }
    if (
      entry.source.startsWith('backend/src/') &&
      (entry.machine_kinds || []).includes('api-controller') &&
      !isTestSource(entry.source) &&
      factValuesByKind(entry, 'auth').includes('controller-auth-implicit')
    ) {
      addFactSource(
        {
          kind: 'problem',
          value: 'controller-auth-implicit',
          label: 'Controller sem guard/public explicito',
        },
        entry.source,
      );
    }
  }

  const expected = new Set();
  for (const bucket of facts.values()) {
    const relPath = normalizePath(visualFactRelPath(bucket.fact));
    expected.add(relPath);
    writeGeneratedNote(relPath, buildVisualFactNote(bucket.fact, bucket.sources));
  }
  writeCameraIndexes(facts);

  const visualRoot = join(SOURCE_MIRROR_DIR, VISUAL_FACT_DIR);
  for (const relPath of listGeneratedMarkdownRelPaths(visualRoot, VISUAL_FACT_DIR)) {
    if (expected.has(relPath)) continue;
    try {
      unlinkSync(join(SOURCE_MIRROR_DIR, relPath));
    } catch (e) {
      log('WARN', `Cannot remove stale visual fact ${relPath}:`, e.message);
    }
  }
}

// ── Persist Manifest State ──────────────────────────────────────────────────

export function persistManifestState(manifest) {
  withMirrorLock('persist-mirror-state', () => {
    writeGeneratedIndexes(manifest);
    writeManifest(manifest);
  });
}
