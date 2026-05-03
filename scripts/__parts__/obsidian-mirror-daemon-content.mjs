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

export function candidateSourceFiles(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.mts`,
    `${basePath}.cts`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.mjs`,
    `${basePath}.cjs`,
    `${basePath}.json`,
    `${basePath}.css`,
    `${basePath}.scss`,
    join(basePath, 'index.ts'),
    join(basePath, 'index.tsx'),
    join(basePath, 'index.js'),
    join(basePath, 'index.jsx'),
    join(basePath, 'index.mjs'),
  ];
  return candidates;
}

export function resolveImportSpecifier(specifier, sourcePath) {
  if (!specifier || specifier.startsWith('node:')) {
    return null;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(specifier)) {
    return null;
  }

  const relSource = normalizePath(relative(REPO_ROOT, sourcePath));
  let basePath = null;

  if (specifier.startsWith('.')) {
    basePath = resolve(dirname(sourcePath), specifier);
  } else if (specifier.startsWith('@/')) {
    if (relSource.startsWith('frontend-admin/')) {
      basePath = join(REPO_ROOT, 'frontend-admin', 'src', specifier.slice(2));
    } else if (relSource.startsWith('frontend/')) {
      basePath = join(REPO_ROOT, 'frontend', 'src', specifier.slice(2));
    }
  }

  if (!basePath) {
    return null;
  }

  for (const candidate of candidateSourceFiles(basePath)) {
    if (existsSync(candidate) && isMirrorableSourceFile(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function extractImportSpecifiers(content) {
  const specs = new Set();
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[^'"]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /@import\s+(?:url\()?['"]([^'"]+)['"]\)?/g,
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(content);
    while (match) {
      specs.add(match[1]);
      match = pattern.exec(content);
    }
  }
  return [...specs];
}

export function resolveMarkdownTarget(target, sourcePath) {
  const clean = target.split('#')[0].split('|')[0].trim();
  if (!clean || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(clean)) {
    return null;
  }
  const base = clean.startsWith('/')
    ? join(REPO_ROOT, clean.slice(1))
    : resolve(dirname(sourcePath), clean);
  const candidates = clean.endsWith('.md')
    ? [base]
    : [base, `${base}.md`, join(base, 'README.md'), join(base, 'index.md')];
  return (
    candidates.find((candidate) => existsSync(candidate) && isMirrorableSourceFile(candidate)) ||
    null
  );
}

export function extractMarkdownTargets(content, sourcePath) {
  const targets = [];
  const seen = new Set();
  const patterns = [/\[\[([^\]\n]+)\]\]/g, /\[[^\]\n]+\]\(([^)\n]+)\)/g];

  for (const pattern of patterns) {
    let match = pattern.exec(content);
    while (match) {
      const target = resolveMarkdownTarget(match[1], sourcePath);
      if (target && !seen.has(target)) {
        seen.add(target);
        targets.push({ specifier: match[1], target });
      }
      match = pattern.exec(content);
    }
  }
  return targets;
}

let packageNameIndex = null;

export function buildPackageNameIndex() {
  if (packageNameIndex) {
    return packageNameIndex;
  }
  packageNameIndex = new Map();
  for (const source of collectAllSourceFiles()) {
    if (basename(source) !== 'package.json') {
      continue;
    }
    try {
      const parsed = JSON.parse(readFileSync(source, 'utf8'));
      if (parsed.name) {
        packageNameIndex.set(parsed.name, source);
      }
    } catch {
      // Ignore invalid package manifests in historical worktrees.
    }
  }
  return packageNameIndex;
}

export function extractPackageRelations(content, sourcePath) {
  if (basename(sourcePath) !== 'package.json') {
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const index = buildPackageNameIndex();
  const deps = Object.assign(
    {},
    parsed.dependencies || {},
    parsed.devDependencies || {},
    parsed.peerDependencies || {},
    parsed.optionalDependencies || {},
  );
  return Object.keys(deps)
    .map((name) => ({ specifier: name, target: index.get(name) }))
    .filter((relation) => relation.target && relation.target !== sourcePath);
}

export function extractPathStringRelations(content, sourcePath) {
  const relations = [];
  const seen = new Set();
  const relSource = normalizePath(relative(REPO_ROOT, sourcePath));
  const isRuntimeArtifact =
    relSource.startsWith('.pulse/') ||
    relSource.startsWith('.gitnexus/') ||
    relSource.endsWith('.json') ||
    relSource.endsWith('.md') ||
    relSource.endsWith('.yaml') ||
    relSource.endsWith('.yml');
  if (!isRuntimeArtifact) {
    return relations;
  }

  const pathPattern =
    /["'`]((?:\.\/|\.\.\/|\/)?(?:[A-Za-z0-9_.@()[\]-]+\/){1,}[A-Za-z0-9_.@()[\]-]+\.[A-Za-z0-9]+)["'`]/g;
  let match = pathPattern.exec(content);
  while (match && relations.length < 80) {
    const raw = match[1];
    const base = raw.startsWith('/')
      ? join(REPO_ROOT, raw.slice(1))
      : raw.startsWith('./') || raw.startsWith('../')
        ? resolve(dirname(sourcePath), raw)
        : join(REPO_ROOT, raw);
    for (const candidate of candidateSourceFiles(base)) {
      if (
        existsSync(candidate) &&
        isMirrorableSourceFile(candidate) &&
        candidate !== sourcePath &&
        !seen.has(candidate)
      ) {
        seen.add(candidate);
        relations.push({ specifier: raw, target: candidate });
        break;
      }
    }
    match = pathPattern.exec(content);
  }
  return relations;
}

export function resolveRepoPathToken(raw, sourcePath) {
  const token = String(raw || '')
    .trim()
    .replace(/^['"`([{<]+|['"`)\]}>.,;:]+$/g, '')
    .split('#')[0];
  if (!token || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(token)) {
    return null;
  }

  const base = token.startsWith('/')
    ? join(REPO_ROOT, token.slice(1))
    : token.startsWith('./') || token.startsWith('../')
      ? resolve(dirname(sourcePath), token)
      : join(REPO_ROOT, token);

  for (const candidate of candidateSourceFiles(base)) {
    if (existsSync(candidate) && isMirrorableSourceFile(candidate) && candidate !== sourcePath) {
      return candidate;
    }
  }

  return null;
}

export function extractEmbeddedRepoPathRelations(content, sourcePath) {
  const relations = [];
  const seen = new Set();
  const text = String(content || '');
  const pathTokenPattern =
    /(?:^|[\s"'`(=:#])((?:(?:backend|frontend|frontend-admin|worker|scripts|docs|prisma|ops|e2e|nginx|\.pulse|\.agents|\.github))\/[^\s"'`,;]+?\.[A-Za-z0-9]+)(?=$|[\s"'`,;#])/g;
  const rootFilePattern =
    /(?:^|[\s"'`(=:#])((?:PULSE_[A-Za-z0-9_-]+|CODEX|CLAUDE|AGENTS|README|package-lock|package|tsconfig|vitest\.config|playwright\.config)\.(?:json|md|js|mjs|ts|yml|yaml))(?=$|[\s"'`),;#])/g;

  for (const pattern of [pathTokenPattern, rootFilePattern]) {
    let match = pattern.exec(text);
    while (match && relations.length < 240) {
      const raw = match[1];
      const target = resolveRepoPathToken(raw, sourcePath);
      if (target && !seen.has(target)) {
        seen.add(target);
        relations.push({ specifier: raw, target });
      }
      match = pattern.exec(text);
    }
  }

  return relations;
}

export function extractInternalRelations(content, sourcePath) {
  const relations = [];
  const seen = new Set();

  for (const specifier of extractImportSpecifiers(content)) {
    const target = resolveImportSpecifier(specifier, sourcePath);
    if (!target || target === sourcePath) {
      continue;
    }

    const relTarget = normalizePath(relative(REPO_ROOT, target));
    if (seen.has(relTarget)) {
      continue;
    }
    seen.add(relTarget);
    relations.push({
      specifier,
      source: relTarget,
      mirror: normalizePath(relative(SOURCE_MIRROR_DIR, sourceToMirrorPath(target))),
      link: obsidianLink(sourceToMirrorPath(target), basename(relTarget)),
    });
  }

  for (const { specifier, target } of [
    ...extractMarkdownTargets(content, sourcePath),
    ...extractPackageRelations(content, sourcePath),
    ...extractPathStringRelations(content, sourcePath),
    ...extractEmbeddedRepoPathRelations(content, sourcePath),
  ]) {
    if (!target || target === sourcePath) continue;
    const relTarget = normalizePath(relative(REPO_ROOT, target));
    if (seen.has(relTarget)) continue;
    seen.add(relTarget);
    relations.push({
      specifier,
      source: relTarget,
      mirror: normalizePath(relative(SOURCE_MIRROR_DIR, sourceToMirrorPath(target))),
      link: obsidianLink(sourceToMirrorPath(target), basename(relTarget)),
    });
  }

  return relations.sort((a, b) => a.source.localeCompare(b.source));
}

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

export function addVisualFact(facts, kind, value, label = value, detail = null) {
  const normalizedKind = String(kind || '').trim();
  const normalizedValue = String(value || '').trim();
  if (!normalizedKind || !normalizedValue) return;
  const key = `${normalizedKind}:${normalizedValue}`;
  if (facts.some((fact) => visualFactKey(fact) === key)) return;
  facts.push({
    kind: normalizedKind,
    value: normalizedValue,
    label: String(label || normalizedValue),
    detail,
  });
}

export function isCodeLikeSource(sourcePath) {
  return ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'].includes(
    extname(sourcePath).toLowerCase(),
  );
}

export function bucketNumber(value, buckets) {
  for (const [label, max] of buckets) {
    if (value <= max) return label;
  }
  return buckets[buckets.length - 1]?.[0] || 'unknown';
}

export function calculateEntropy(text) {
  if (!text) return 0;
  const counts = new Map();
  for (const char of text) counts.set(char, (counts.get(char) || 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / text.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

export function extractDominantTokens(text) {
  const counts = new Map();
  const stop = new Set([
    'the',
    'and',
    'for',
    'from',
    'with',
    'this',
    'that',
    'const',
    'let',
    'var',
    'return',
    'import',
    'export',
    'default',
    'function',
    'class',
    'type',
    'interface',
    'true',
    'false',
    'null',
    'undefined',
  ]);
  const pattern = /[A-Za-z_][A-Za-z0-9_]{3,}/g;
  let match = pattern.exec(text || '');
  while (match) {
    const token = match[0].toLowerCase();
    if (!stop.has(token) && !/^\d+$/.test(token)) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
    match = pattern.exec(text || '');
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([token]) => token);
}

export function extractJsonKeys(content) {
  let parsed;
  try {
    parsed = JSON.parse(content || '');
  } catch {
    return [];
  }
  const keys = new Set();
  const visit = (value, depth = 0) => {
    if (!value || depth > 4) return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 8)) visit(item, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;
    for (const key of Object.keys(value).slice(0, 20)) {
      keys.add(key);
      visit(value[key], depth + 1);
      if (keys.size >= 20) return;
    }
  };
  visit(parsed);
  return [...keys].sort().slice(0, 8);
}

export function extractMarkdownHeadings(content) {
  const headings = [];
  const pattern = /^#{1,6}\s+(.+)$/gm;
  let match = pattern.exec(content || '');
  while (match && headings.length < 12) {
    headings.push(match[1].trim().slice(0, 80));
    match = pattern.exec(content || '');
  }
  return headings;
}

export function addContentShapeFacts(facts, sourcePath, text) {
  const bytes = Buffer.byteLength(text || '', 'utf8');
  const lines = text ? text.split(/\r\n|\r|\n/).length : 0;
  const averageLine = lines ? Math.round(bytes / lines) : 0;
  const entropy = calculateEntropy(text || '');
  const lower = String(text || '').toLowerCase();
  const contentHash = sha256(text || '');
  const lineBucket = bucketNumber(lines, [
    ['lines:0', 0],
    ['lines:1-20', 20],
    ['lines:21-80', 80],
    ['lines:81-250', 250],
    ['lines:251-1000', 1000],
    ['lines:1000+', Number.POSITIVE_INFINITY],
  ]);
  const byteBucket = bucketNumber(bytes, [
    ['bytes:0', 0],
    ['bytes:1-2kb', 2048],
    ['bytes:2-10kb', 10240],
    ['bytes:10-50kb', 51200],
    ['bytes:50-250kb', 256000],
    ['bytes:250kb+', Number.POSITIVE_INFINITY],
  ]);
  const averageLineBucket = bucketNumber(averageLine, [
    ['avg-line:0-40', 40],
    ['avg-line:41-100', 100],
    ['avg-line:101-240', 240],
    ['avg-line:240+', Number.POSITIVE_INFINITY],
  ]);
  const entropyBucket = bucketNumber(Math.round(entropy * 10), [
    ['entropy:empty', 0],
    ['entropy:low', 35],
    ['entropy:medium', 45],
    ['entropy:high', 55],
    ['entropy:very-high', Number.POSITIVE_INFINITY],
  ]);
  const ext = extname(sourcePath).toLowerCase() || 'no-extension';

  for (let index = 0; index < 4; index++) {
    const shard = contentHash.slice(index * 2, index * 2 + 2);
    addVisualFact(facts, 'content-hash-shard', `${index}:${shard}`, `Hash shard ${index}:${shard}`);
  }
  addVisualFact(facts, 'content-shape', lineBucket, lineBucket);
  addVisualFact(facts, 'content-shape', byteBucket, byteBucket);
  addVisualFact(facts, 'content-shape', averageLineBucket, averageLineBucket);
  addVisualFact(facts, 'content-shape', entropyBucket, entropyBucket);
  addVisualFact(facts, 'file-extension', ext, ext);
  if (text.includes('\r\n')) addVisualFact(facts, 'content-shape', 'newline:crlf', 'CRLF newline');
  if (text.includes('\n') && !text.includes('\r\n'))
    addVisualFact(facts, 'content-shape', 'newline:lf', 'LF newline');
  if (/\t/.test(text)) addVisualFact(facts, 'content-shape', 'indent:tabs', 'Tab indentation');
  if (/^ {2,}\S/m.test(text))
    addVisualFact(facts, 'content-shape', 'indent:spaces', 'Space indentation');
  if (/\b(password|secret|token|private_key|api_key)\b/i.test(text))
    addVisualFact(facts, 'debt', 'secret-like-token', 'Secret-like token text');
  if (lower.includes('deprecated'))
    addVisualFact(facts, 'debt', 'deprecated-marker', 'Deprecated marker');
}

export function addStructuredContentFacts(facts, sourcePath, text) {
  const ext = extname(sourcePath).toLowerCase();
  const relPath = normalizePath(relative(REPO_ROOT, sourcePath));
  const generatedRuntimeArtifact = /^(\.pulse|\.gitnexus|\.agents|\.kilo|\.omx|\.serena)\//.test(
    relPath,
  );
  if (ext === '.json' && !generatedRuntimeArtifact) {
    for (const key of extractJsonKeys(text)) addVisualFact(facts, 'json-key', key, key);
  }
  if (ext === '.md' || ext === '.mdx') {
    for (const heading of extractMarkdownHeadings(text))
      addVisualFact(facts, 'markdown-heading', heading, heading);
  }
  const vocabularyLimit = generatedRuntimeArtifact ? 3 : 8;
  for (const token of extractDominantTokens(text).slice(0, vocabularyLimit)) {
    addVisualFact(facts, 'vocabulary', token, token);
  }
}

export function extractDecoratorRoutes(content) {
  const routes = [];
  const controllerMatch = /@Controller\s*\(\s*['"`]([^'"`]*)['"`]\s*\)/.exec(content || '');
  const base = controllerMatch ? controllerMatch[1].replace(/^\/|\/$/g, '') : '';
  const pattern = /@(Get|Post|Put|Patch|Delete|Options|Head)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
  let match = pattern.exec(content || '');
  while (match) {
    const method = match[1].toUpperCase();
    const route = String(match[2] || '').replace(/^\/|\/$/g, '');
    const full = `/${[base, route].filter(Boolean).join('/')}`;
    routes.push(`${method} ${full}`);
    match = pattern.exec(content || '');
  }
  return routes;
}

export function normalizeHttpPath(path) {
  const raw = String(path || '').trim();
  if (!raw) return '/';
  return `/${raw
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/?api\//i, '')
    .replace(/^\/+|\/+$/g, '')}`;
}

export function extractApiConsumers(content) {
  const calls = [];
  const seen = new Set();
  const patterns = [
    /\b(api|client|http|axios)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    /\bfetch\s*\(\s*['"`]([^'"`]+)['"`]\s*,?\s*(?:\{[^}]*?\bmethod\s*:\s*['"`]([A-Z]+)['"`])?/gis,
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(content || '');
    while (match && calls.length < 200) {
      const method = (match[2] || match[4] || 'GET').toUpperCase();
      const target = match[3] || match[1] || '';
      if (target.startsWith('/') || target.startsWith('api/')) {
        const value = `${method} ${normalizeHttpPath(target)}`;
        if (!seen.has(value)) {
          seen.add(value);
          calls.push(value);
        }
      }
      match = pattern.exec(content || '');
    }
  }

  return calls;
}

export function extractExportedSymbols(content) {
  const symbols = [];
  const seen = new Set();
  const patterns = [
    /\bexport\s+(?:default\s+)?(?:abstract\s+)?class\s+([A-Z][A-Za-z0-9_]*)/g,
    /\bexport\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    /\bexport\s+(?:interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(content || '');
    while (match && symbols.length < 120) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        symbols.push(match[1]);
      }
      match = pattern.exec(content || '');
    }
  }

  return symbols;
}

export function extractPrismaModels(content) {
  const models = [];
  const pattern = /^\s*(model|enum)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm;
  let match = pattern.exec(content || '');
  while (match) {
    models.push(`${match[1]}:${match[2]}`);
    match = pattern.exec(content || '');
  }
  return models;
}

export function extractDbOperations(content) {
  const operations = new Set();
  const pattern =
    /\b(?:prisma|this\.prisma|tx|transaction)\.([A-Za-z_][A-Za-z0-9_]*)\.(findUnique|findFirst|findMany|create|createMany|update|updateMany|upsert|delete|deleteMany|aggregate|count)\s*\(/g;
  let match = pattern.exec(content || '');
  while (match && operations.size < 200) {
    operations.add(`${match[1]}.${match[2]}`);
    match = pattern.exec(content || '');
  }
  if (/\.\$transaction\s*\(/.test(content || '')) operations.add('$transaction');
  return [...operations].sort();
}

export function extractAuthFacts(content) {
  const facts = [];
  if (/@UseGuards\s*\(/.test(content || '')) facts.push('guarded');
  if (/@Public\s*\(/.test(content || '') || /\bskipAuth\b|isPublic\b/.test(content || ''))
    facts.push('public');
  if (
    /@Controller\s*\(/.test(content || '') &&
    !/@UseGuards\s*\(|@Public\s*\(/.test(content || '')
  ) {
    facts.push('controller-auth-implicit');
  }
  return facts;
}

export function countPattern(text, pattern) {
  return [...String(text || '').matchAll(pattern)].length;
}

export function extractFunctionCalls(content) {
  const calls = new Map();
  const pattern = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  const ignore = new Set([
    'if',
    'for',
    'while',
    'switch',
    'catch',
    'function',
    'return',
    'typeof',
    'new',
    'class',
    'super',
  ]);
  let match = pattern.exec(content || '');
  while (match) {
    const name = match[1];
    if (!ignore.has(name) && name.length > 2) {
      calls.set(name, (calls.get(name) || 0) + 1);
    }
    match = pattern.exec(content || '');
  }
  return [...calls.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 24)
    .map(([name]) => name);
}

export function addIntensityFact(facts, kind, prefix, count, label) {
  if (count <= 0) return;
  const bucket = bucketNumber(count, [
    [`${prefix}:1`, 1],
    [`${prefix}:2-5`, 5],
    [`${prefix}:6-20`, 20],
    [`${prefix}:21-80`, 80],
    [`${prefix}:80+`, Number.POSITIVE_INFINITY],
  ]);
  addVisualFact(facts, kind, bucket, `${label} ${bucket.split(':').pop()}`);
}

export function addComputationalEffectFacts(facts, sourcePath, text) {
  const relPath = normalizePath(relative(REPO_ROOT, sourcePath));
  const lower = relPath.toLowerCase();
  const codeLike = isCodeLikeSource(sourcePath);
  const ext = extname(sourcePath).toLowerCase();

  if (!codeLike) {
    if (ext === '.json' || ext === '.yaml' || ext === '.yml' || ext === '.toml') {
      addVisualFact(facts, 'computational-effect', 'configuration', 'Configuration effect');
    } else if (ext === '.md' || ext === '.mdx') {
      addVisualFact(
        facts,
        'computational-effect',
        'documentation-or-contract',
        'Documentation/contract effect',
      );
    } else {
      addVisualFact(facts, 'computational-effect', 'static-asset-or-data', 'Static/data effect');
    }
    return;
  }

  const source = String(text || '');
  const branchCount = countPattern(source, /\b(if|switch|case|\?|&&|\|\|)\b/g);
  const loopCount = countPattern(source, /\b(for|while|forEach|map|reduce|filter)\b/g);
  const asyncCount = countPattern(source, /\b(await|async|Promise|then|catch)\b/g);
  const throwCount = countPattern(source, /\bthrow\b|\.catch\s*\(|try\s*\{|catch\s*\(/g);
  const callCount = countPattern(source, /\b[A-Za-z_$][A-Za-z0-9_$]*\s*\(/g);

  addIntensityFact(facts, 'effect-intensity', 'branches', branchCount, 'Branching');
  addIntensityFact(facts, 'effect-intensity', 'loops', loopCount, 'Looping');
  addIntensityFact(facts, 'effect-intensity', 'async', asyncCount, 'Async');
  addIntensityFact(facts, 'effect-intensity', 'errors', throwCount, 'Error path');
  addIntensityFact(facts, 'effect-intensity', 'calls', callCount, 'Call volume');

  for (const call of extractFunctionCalls(source)) addVisualFact(facts, 'call', call, call);

  if (/\b(prisma|this\.prisma|tx)\./.test(source))
    addVisualFact(facts, 'computational-effect', 'database-io', 'Database I/O');
  if (/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(source))
    addVisualFact(facts, 'computational-effect', 'database-write', 'Database write');
  if (/\.(findUnique|findFirst|findMany|aggregate|count)\s*\(/.test(source))
    addVisualFact(facts, 'computational-effect', 'database-read', 'Database read');
  if (/\b(fetch|axios|apiFetch|http\.)\b/.test(source))
    addVisualFact(facts, 'computational-effect', 'network-io', 'Network I/O');
  if (/\b(localStorage|sessionStorage|indexedDB|cookie)\b/.test(source))
    addVisualFact(facts, 'computational-effect', 'browser-persistence', 'Browser persistence');
  if (/\b(useState|useReducer|useEffect|useMemo|useCallback|useSWR)\b/.test(source))
    addVisualFact(facts, 'computational-effect', 'ui-reactivity', 'UI reactivity');
  if (/@Controller\s*\(|@(Get|Post|Put|Patch|Delete)\s*\(/.test(source))
    addVisualFact(facts, 'computational-effect', 'http-server', 'HTTP server effect');
  if (/@Injectable\s*\(|class\s+[A-Za-z0-9_]+Service\b/.test(source))
    addVisualFact(facts, 'computational-effect', 'service-logic', 'Service logic');
  if (/@Module\s*\(/.test(source))
    addVisualFact(
      facts,
      'computational-effect',
      'dependency-injection-wiring',
      'Dependency injection wiring',
    );
  if (/@UseGuards\s*\(|\bJwt|Auth|Guard|workspaceId|tenantId\b/.test(source))
    addVisualFact(facts, 'computational-effect', 'auth-or-isolation', 'Auth/isolation effect');
  if (/\b(Queue|BullMQ|Worker|processor|enqueue|addJob|job)\b/.test(source))
    addVisualFact(facts, 'computational-effect', 'queue-work', 'Queue/work effect');
  if (/\b(stripe|mercadopago|whatsapp|waha|openai|redis|sentry|datadog)\b/i.test(source))
    addVisualFact(facts, 'computational-effect', 'external-provider', 'External provider effect');
  if (
    /^\s*(export\s+)?(interface|type)\s+/m.test(source) &&
    !/\b(function|class|const|let|var)\b/.test(source)
  ) {
    addVisualFact(facts, 'computational-effect', 'type-contract-only', 'Type contract only');
  }
  if (lower.includes('__tests__') || /\.(spec|test)\.[cm]?[jt]sx?$/.test(lower)) {
    addVisualFact(facts, 'computational-effect', 'proof-execution', 'Proof/test execution');
  }
}

export function extractExternalPackages(content) {
  const packages = new Set();
  for (const specifier of extractImportSpecifiers(content || '')) {
    if (
      !specifier ||
      specifier.startsWith('.') ||
      specifier.startsWith('@/') ||
      specifier.startsWith('node:')
    ) {
      continue;
    }
    const parts = specifier.split('/');
    const pkg = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    if (pkg) packages.add(pkg);
  }
  return [...packages].sort();
}

export function extractVisualFacts(
  sourcePath,
  content,
  machine,
  gitState,
  relations,
  omitSourceBody,
) {
  const relPath = normalizePath(relative(REPO_ROOT, sourcePath));
  const facts = [];
  const text = content || '';
  const codeLike = isCodeLikeSource(sourcePath);
  const prismaSchema = extname(sourcePath).toLowerCase() === '.prisma';

  addContentShapeFacts(facts, sourcePath, text);
  addStructuredContentFacts(facts, sourcePath, text);
  addComputationalEffectFacts(facts, sourcePath, text);
  addVisualFact(facts, 'surface', machine.surface, `Surface: ${machine.surface}`);
  addVisualFact(facts, 'risk', machine.risk, `Risk: ${machine.risk}`);
  addVisualFact(
    facts,
    'language',
    detectLanguage(sourcePath) || 'none',
    `Lang: ${detectLanguage(sourcePath) || 'none'}`,
  );
  addVisualFact(
    facts,
    'payload',
    omitSourceBody ? 'metadata-only' : 'full-text',
    omitSourceBody ? 'Metadata only' : 'Full text',
  );
  if (gitState.dirty) addVisualFact(facts, 'git-state', 'dirty', 'Dirty workspace');
  if (gitState.localCommit) addVisualFact(facts, 'git-state', 'local-commit', 'Local commit');
  for (const kind of machine.kinds) addVisualFact(facts, 'kind', kind, `Kind: ${kind}`);
  for (const relation of relations)
    addVisualFact(facts, 'dependency', relation.source, basename(relation.source));
  if (codeLike) {
    for (const route of extractDecoratorRoutes(text)) addVisualFact(facts, 'route', route, route);
    for (const call of extractApiConsumers(text)) addVisualFact(facts, 'api-call', call, call);
    for (const symbol of extractExportedSymbols(text))
      addVisualFact(facts, 'symbol', symbol, symbol);
    for (const op of extractDbOperations(text)) addVisualFact(facts, 'db-op', op, op);
    for (const auth of extractAuthFacts(text)) addVisualFact(facts, 'auth', auth, auth);
    if (/\b(workspaceId|tenantId|accountId|ownerId|userId)\b/.test(text)) {
      addVisualFact(facts, 'isolation-key', 'tenant-or-owner-scope', 'Tenant/owner scope key');
    }
    for (const pkg of extractExternalPackages(text)) addVisualFact(facts, 'package', pkg, pkg);
  }
  if (prismaSchema) {
    for (const model of extractPrismaModels(text)) addVisualFact(facts, 'schema', model, model);
  }

  const detectors = [
    ['debt', 'todo', /\bTODO\b|FIXME|XXX|HACK/i, 'TODO/FIXME/HACK'],
    [
      'debt',
      'mock-or-fake',
      /\bmock\b|\bfake\b|placeholder|simulat(?:e|ed|ion)|demo/i,
      'Mock/fake/simulation',
    ],
    ['debt', 'random-runtime', /Math\.random\s*\(/, 'Random runtime value'],
    ['debt', 'local-storage', /\blocalStorage\b|\bsessionStorage\b/, 'Browser storage state'],
    ['debt', 'typescript-any', /:\s*any\b|as\s+any\b|<any>/, 'TypeScript any'],
    [
      'debt',
      'suppression-comment',
      /@ts-ignore|@ts-expect-error|eslint-disable|biome-ignore|NOSONAR|noqa|codacy:ignore/i,
      'Suppression bypass',
    ],
    ['debt', 'console-log', /\bconsole\.(log|warn|error|debug)\s*\(/, 'Console logging'],
    ['debt', 'swallowed-error', /catch\s*\([^)]*\)\s*\{\s*(?:\/\/[^\n]*)?\s*\}/s, 'Empty catch'],
    ['debt', 'process-env-runtime', /\bprocess\.env\.[A-Z0-9_]+\b/, 'Runtime env dependency'],
    [
      'debt',
      'hardcoded-localhost',
      /localhost|127\.0\.0\.1|0\.0\.0\.0/,
      'Hardcoded local endpoint',
    ],
    [
      'debt',
      'hardcoded-timeout',
      /\bsetTimeout\s*\(|\bsetInterval\s*\(|timeout(?:Ms|MS)?\s*[:=]\s*\d{3,}/,
      'Hardcoded timer/timeout',
    ],
    [
      'debt',
      'money-number',
      /\b(amount|price|total|subtotal|fee|commission|payout|balance|wallet|ledger)\b[^;\n]{0,80}\b\d+(?:\.\d+)?\b/i,
      'Money value literal',
    ],
    ['debt', 'unsafe-delete-many', /\.deleteMany\s*\(/, 'Bulk delete operation'],
    ['debt', 'unsafe-update-many', /\.updateMany\s*\(/, 'Bulk update operation'],
    ['proof', 'test-file', isTestSource(relPath) ? /./ : /$a/, 'Test/proof file'],
    ['integration', 'stripe', /\bstripe\b/i, 'Stripe integration'],
    ['integration', 'mercado-pago', /mercado\s*pago|mercadopago/i, 'Mercado Pago integration'],
    ['integration', 'whatsapp', /\bwhatsapp\b|\bwaha\b|\bmeta\b/i, 'WhatsApp/Meta integration'],
    ['integration', 'openai', /\bopenai\b/i, 'OpenAI integration'],
    ['integration', 'redis-bullmq', /\bredis\b|\bbullmq\b/i, 'Redis/BullMQ integration'],
  ];

  for (const [kind, value, pattern, label] of detectors) {
    if (pattern.test(text)) addVisualFact(facts, kind, value, label);
  }

  return facts;
}

export function buildVisualFactsSection(facts) {
  if (facts.length === 0) return [];
  return [
    '## Comportamento visual do codigo',
    '',
    ...facts.map((fact) => `- \`${visualFactKey(fact)}\`${fact.detail ? ` - ${fact.detail}` : ''}`),
    '',
  ];
}

export function buildConstructionMapSection(relPath, machine, gitState) {
  const links = [clusterLink(clusterKeyForSource(relPath))];

  if (gitState.dirty) links.push(machineHubLink('workspace-sujo', 'Workspace sujo'));
  if (machine.risk === 'critical') links.push(machineHubLink('risco-critico', 'Risco critico'));
  if (machine.risk === 'high') links.push(machineHubLink('risco-alto', 'Risco alto'));
  if (machine.kinds.includes('api-controller'))
    links.push(machineHubLink('runtime-api', 'Runtime API'));
  if (machine.surface === 'frontend') links.push(machineHubLink('ui-frontend', 'UI frontend'));
  if (machine.kinds.includes('test'))
    links.push(machineHubLink('provas-testes', 'Provas e testes'));
  if (machine.surface === 'pulse-machine')
    links.push(machineHubLink('pulse-maquina', 'PULSE maquina'));
  if (machine.surface === 'governance') links.push(machineHubLink('governanca', 'Governanca'));

  return ['## Mapa da obra', '', ...[...new Set(links)].map((link) => `- ${link}`), ''];
}

let mirrorSignalIndexCache = null;

export function readJsonArtifact(...parts) {
  const filePath = join(REPO_ROOT, ...parts);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function signalBucketForSource(index, source) {
  const normalized = normalizePath(source || '');
  if (!normalized) return null;
  let bucket = index.get(normalized);
  if (!bucket) {
    bucket = { tags: new Set(), details: [] };
    index.set(normalized, bucket);
  }
  return bucket;
}

export function addSignalTag(index, source, tag, detail = null) {
  const bucket = signalBucketForSource(index, source);
  if (!bucket) return;
  bucket.tags.add(tag);
  if (detail) bucket.details.push(detail);
}

export function buildMirrorSignalIndex() {
  if (mirrorSignalIndexCache) return mirrorSignalIndexCache;

  const index = new Map();
  const codacy = readJsonArtifact('PULSE_CODACY_STATE.json');
  if (codacy) {
    for (const item of codacy.topFiles || []) {
      addSignalTag(index, item.file, SIGNAL_HOTSPOT_TAG, `Codacy hotspot: ${item.count} issue(s)`);
    }
    for (const issue of codacy.highPriorityBatch || []) {
      const severity = String(issue.severityLevel || '').toLowerCase();
      if (severity === 'high' || severity === 'error') {
        addSignalTag(
          index,
          issue.filePath,
          SIGNAL_STATIC_HIGH_TAG,
          `Codacy ${issue.severityLevel}: ${issue.message || issue.patternId || 'high priority issue'}`,
        );
      }
    }
  }

  const external = readJsonArtifact('.pulse', 'current', 'PULSE_EXTERNAL_SIGNAL_STATE.json');
  if (external) {
    for (const signal of external.signals || []) {
      for (const file of signal.relatedFiles || []) {
        addSignalTag(
          index,
          file,
          SIGNAL_EXTERNAL_TAG,
          `${signal.source || 'external'} ${signal.type || 'signal'}: ${signal.summary || signal.id || 'observed signal'}`,
        );
      }
    }
  }

  mirrorSignalIndexCache = index;
  return index;
}

export function sourceBaseTags(relPath, lightweight) {
  const tags = [];
  if (lightweight) tags.push(METADATA_ONLY_TAG);
  return tags;
}

export function isTestSource(relPath) {
  return (
    /(^|\/)(__tests__|test|tests|e2e)(\/|$)/.test(relPath) ||
    /\.(spec|test)\.[cm]?[jt]sx?$/.test(relPath)
  );
}

export function classifyMachineSource(relPath, content) {
  const normalized = normalizePath(relPath);
  const lower = normalized.toLowerCase();
  const kinds = [];
  let surface = 'source';
  let risk = 'normal';

  if (normalized.startsWith('frontend/src/') || normalized.startsWith('frontend-admin/')) {
    surface = 'frontend';
  } else if (normalized.startsWith('backend/src/')) {
    surface = 'backend';
  } else if (normalized.startsWith('worker/')) {
    surface = 'worker';
  } else if (normalized.startsWith('scripts/pulse/') || normalized.startsWith('.pulse/')) {
    surface = 'pulse-machine';
  } else if (
    normalized.startsWith('.github/') ||
    normalized.startsWith('ops/') ||
    normalized.startsWith('scripts/ops/') ||
    ['AGENTS.md', 'CLAUDE.md', 'CODEX.md', '.codacy.yml', 'package.json'].includes(normalized)
  ) {
    surface = 'governance';
  }

  if (isTestSource(normalized)) {
    kinds.push('test');
  }
  if (
    /controller\.[cm]?tsx?$/.test(lower) ||
    /@(Controller|Get|Post|Put|Patch|Delete)\b/.test(content || '')
  ) {
    kinds.push('api-controller');
  }
  if (/\.module\.[cm]?tsx?$/.test(lower) || /@Module\b/.test(content || '')) kinds.push('module');
  if (/service\.[cm]?tsx?$/.test(lower) || /@Injectable\b/.test(content || ''))
    kinds.push('service');
  if (
    /\.tsx$/.test(lower) &&
    /(export default function|export function|function [A-Z][A-Za-z0-9_]*|const [A-Z][A-Za-z0-9_]*\s*=)/.test(
      content || '',
    )
  ) {
    kinds.push('ui-component');
  }
  if (/schema\.prisma$/.test(lower) || /\.prisma$/.test(lower)) kinds.push('data-model');
  if (/route\.[cm]?[jt]sx?$/.test(lower) || /page\.[cm]?[jt]sx?$/.test(lower)) {
    kinds.push('frontend-route');
  }

  if (
    /(^|\/)(payments?|wallet|ledger|billing|auth|kyc|webhooks?|prisma|ops|\.github)(\/|$)/.test(
      lower,
    ) ||
    /(^|\/)(package\.json|pnpm-lock\.yaml|\.codacy\.yml|agents\.md|claude\.md|codex\.md)$/.test(
      lower,
    )
  ) {
    risk = 'critical';
  } else if (
    /(^|\/)(whatsapp|worker|queue|meta|tiktok|stripe|mercado-pago|openai|integrations?|mass-send|campaigns?)(\/|$)/.test(
      lower,
    )
  ) {
    risk = 'high';
  }

  return {
    kinds: [...new Set(kinds)],
    surface,
    risk,
  };
}

export function activeConstructionTags(machine, gitState, signalTags = []) {
  const tags = [];
  const signalSet = new Set(signalTags);

  if (machine.surface === 'frontend') tags.push(GRAPH_SURFACE_UI_TAG);
  if (machine.surface === 'backend') tags.push(GRAPH_SURFACE_BACKEND_TAG);
  if (machine.surface === 'worker') tags.push(GRAPH_SURFACE_WORKER_TAG);
  if (machine.surface === 'source') tags.push(GRAPH_SURFACE_SOURCE_TAG);
  if (machine.surface === 'governance' || machine.surface === 'pulse-machine') {
    tags.push(GRAPH_GOVERNANCE_TAG);
  }
  if (machine.surface === 'pulse-machine') tags.push(PULSE_MACHINE_TAG);

  if (gitState.dirty) {
    if (machine.risk === 'critical') tags.push(GRAPH_RISK_CRITICAL_TAG);
    if (machine.risk === 'high') tags.push(GRAPH_RISK_HIGH_TAG);
    if (machine.kinds.includes('api-controller')) tags.push(GRAPH_RUNTIME_API_TAG);
  }

  if (signalSet.has(SIGNAL_STATIC_HIGH_TAG) && machine.risk === 'critical') {
    tags.push(GRAPH_RISK_CRITICAL_TAG);
  }
  if (signalSet.has(SIGNAL_HOTSPOT_TAG) && machine.risk === 'high') {
    tags.push(GRAPH_RISK_HIGH_TAG);
  }

  return [...new Set(tags)];
}

export function isLightweightMirrorSource(sourcePath) {
  const rel = normalizePath(relative(REPO_ROOT, sourcePath));
  const first = rel.split('/')[0];
  if (
    first === '.agents' ||
    first === '.beads' ||
    first === '.gitnexus' ||
    first === '.kilo' ||
    first === '.omx' ||
    first === '.pulse' ||
    first === '.serena'
  ) {
    return true;
  }

  const name = basename(rel);
  return (
    /^PULSE_.*\.(json|md)$/.test(name) ||
    /^FUNCTIONAL_.*\.md$/.test(name) ||
    name === 'KLOEL_PRODUCT_MAP.md' ||
    name === 'AUDIT_FEATURE_MATRIX.md' ||
    name === 'package-lock.json'
  );
}

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
