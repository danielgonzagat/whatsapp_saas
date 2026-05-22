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

export function candidateSourceFiles(basePath) {
  // TypeScript ESM/NodeNext convention: an import specifier `./x.js` (also
  // .jsx/.mjs/.cjs) resolves to the `./x.ts` (or .tsx/.mts/.cts) SOURCE file.
  // Without rewriting the extension the dependency edge is never found and
  // both endpoints look orphan in the graph even though the code IS linked.
  const stripped = basePath.replace(/\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/, '');
  const bases = stripped === basePath ? [basePath] : [stripped, basePath];
  const candidates = [];
  for (const b of bases) {
    candidates.push(
      b,
      `${b}.ts`,
      `${b}.tsx`,
      `${b}.mts`,
      `${b}.cts`,
      `${b}.js`,
      `${b}.jsx`,
      `${b}.mjs`,
      `${b}.cjs`,
      `${b}.json`,
      `${b}.css`,
      `${b}.scss`,
      join(b, 'index.ts'),
      join(b, 'index.tsx'),
      join(b, 'index.js'),
      join(b, 'index.jsx'),
      join(b, 'index.mjs'),
    );
  }
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

