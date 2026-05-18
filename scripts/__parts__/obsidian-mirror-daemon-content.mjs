import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

import {
  GRAPH_EFFECT_ASYNC_TAG,
  GRAPH_EFFECT_CONFIG_TAG,
  GRAPH_EFFECT_DATA_TAG,
  GRAPH_EFFECT_ENTRYPOINT_TAG,
  GRAPH_EFFECT_ERROR_TAG,
  GRAPH_EFFECT_NETWORK_TAG,
  GRAPH_EFFECT_SECURITY_TAG,
  GRAPH_EFFECT_STATE_TAG,
  GRAPH_GOVERNANCE_TAG,
  GRAPH_ORPHAN_TAG,
  GRAPH_PROOF_TEST_TAG,
  GRAPH_RISK_CRITICAL_TAG,
  GRAPH_RISK_HIGH_TAG,
  GRAPH_RUNTIME_API_TAG,
  GRAPH_SURFACE_BACKEND_TAG,
  GRAPH_SURFACE_SOURCE_TAG,
  GRAPH_SURFACE_UI_TAG,
  GRAPH_SURFACE_WORKER_TAG,
  LOCAL_COMMIT_TAG,
  METADATA_ONLY_TAG,
  PULSE_MACHINE_TAG,
  REPO_ROOT,
  SOURCE_BODY_MIRROR_MAX_BYTES,
  SOURCE_MIRROR_DIR,
  DIRTY_WORKSPACE_TAG,
} from '../obsidian-mirror-daemon-constants.mjs';

import {
  detectLanguage,
  gitStateForSource,
  normalizePath,
  obsidianLink,
  sha256,
  sha256File,
  sourceToMirrorPath,
} from './obsidian-mirror-daemon-utils.mjs';

function yamlScalar(value) {
  const text = String(value ?? '');
  if (/^[A-Za-z0-9_./:-]+$/.test(text)) {
    return text;
  }
  return JSON.stringify(text);
}

function frontmatterList(key, values) {
  if (!values.length) {
    return [`${key}: []`];
  }
  return [`${key}:`, ...values.map((value) => `  - ${yamlScalar(value)}`)];
}

function candidateSourceFiles(basePath) {
  return [
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
}

function resolveImportSpecifier(specifier, sourcePath) {
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
  return candidateSourceFiles(basePath).find((candidate) => existsSync(candidate)) || null;
}

function extractImportSpecifiers(content) {
  const specs = new Set();
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[^'"]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
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

function extractRelations(content, sourcePath) {
  const relations = [];
  const seen = new Set();
  for (const specifier of extractImportSpecifiers(content)) {
    const target = resolveImportSpecifier(specifier, sourcePath);
    if (!target || target === sourcePath) {
      continue;
    }
    const source = normalizePath(relative(REPO_ROOT, target));
    if (seen.has(source)) {
      continue;
    }
    seen.add(source);
    relations.push({
      specifier,
      source,
      mirror: normalizePath(relative(SOURCE_MIRROR_DIR, sourceToMirrorPath(target))),
      link: obsidianLink(sourceToMirrorPath(target), basename(source)),
    });
  }
  return relations.sort((a, b) => a.source.localeCompare(b.source)).slice(0, 160);
}

function surfaceFor(relPath) {
  if (relPath.startsWith('backend/')) {
    return 'backend';
  }
  if (relPath.startsWith('frontend/') || relPath.startsWith('frontend-admin/')) {
    return 'ui';
  }
  if (relPath.startsWith('worker/')) {
    return 'worker';
  }
  if (
    relPath.startsWith('ops/') ||
    relPath.startsWith('.github/') ||
    relPath.startsWith('.husky/') ||
    ['AGENTS.md', 'CLAUDE.md', 'CODEX.md', '.codacy.yml', 'package.json'].includes(relPath)
  ) {
    return 'governance';
  }
  return 'source';
}

function riskFor(relPath, content) {
  if (surfaceFor(relPath) === 'governance') {
    return 'critical';
  }
  if (/payment|wallet|ledger|payout|kyc|auth|webhook|secret|token/i.test(relPath + content)) {
    return 'high';
  }
  return 'normal';
}

function tagsFor(relPath, content, gitState, relations, lang) {
  const tags = new Set();
  const surface = surfaceFor(relPath);
  const risk = riskFor(relPath, content);

  if (surface === 'backend') {
    tags.add(GRAPH_SURFACE_BACKEND_TAG);
  } else if (surface === 'ui') {
    tags.add(GRAPH_SURFACE_UI_TAG);
  } else if (surface === 'worker') {
    tags.add(GRAPH_SURFACE_WORKER_TAG);
  } else if (surface === 'governance') {
    tags.add(GRAPH_GOVERNANCE_TAG);
  } else {
    tags.add(GRAPH_SURFACE_SOURCE_TAG);
  }

  if (risk === 'critical') {
    tags.add(GRAPH_RISK_CRITICAL_TAG);
  } else if (risk === 'high') {
    tags.add(GRAPH_RISK_HIGH_TAG);
  }
  if (gitState.dirty) {
    tags.add(DIRTY_WORKSPACE_TAG);
  }
  if (gitState.localCommit) {
    tags.add(LOCAL_COMMIT_TAG);
  }
  if (
    relPath.startsWith('.pulse/') ||
    relPath.startsWith('scripts/pulse/') ||
    relPath.startsWith('backend/src/pulse/') ||
    /^PULSE_[^/]+/.test(relPath)
  ) {
    tags.add(PULSE_MACHINE_TAG);
  }
  if (!relations.length) {
    tags.add(GRAPH_ORPHAN_TAG);
  }
  if (/\b(test|spec|e2e)\b/i.test(relPath)) {
    tags.add(GRAPH_PROOF_TEST_TAG);
  }
  if (/@(Get|Post|Put|Patch|Delete)\s*\(|\bfetch\s*\(|\baxios\b|\bapi\./.test(content)) {
    tags.add(GRAPH_RUNTIME_API_TAG);
  }
  if (/\basync\b|\bawait\b|Promise<|\bsetTimeout\b|\bsetInterval\b/.test(content)) {
    tags.add(GRAPH_EFFECT_ASYNC_TAG);
  }
  if (/\bthrow\b|\bcatch\s*\(|Logger|log\./.test(content)) {
    tags.add(GRAPH_EFFECT_ERROR_TAG);
  }
  if (/\bprisma\b|\bdatabase\b|\bredis\b|\bqueue\b|\bBullMQ\b/i.test(content)) {
    tags.add(GRAPH_EFFECT_DATA_TAG);
  }
  if (/\buseState\b|\buseReducer\b|\bzustand\b|\blocalStorage\b|\bsessionStorage\b/.test(content)) {
    tags.add(GRAPH_EFFECT_STATE_TAG);
  }
  if (/\bGuard\b|\bJwt\b|\bworkspaceId\b|\bauth\b|\bpermission\b/i.test(content)) {
    tags.add(GRAPH_EFFECT_SECURITY_TAG);
  }
  if (/\bhttp\b|\bwebhook\b|\boauth\b|\bapi\b|\bprovider\b/i.test(content)) {
    tags.add(GRAPH_EFFECT_NETWORK_TAG);
  }
  if (/\bController\b|\bModule\b|\bpage\b|\broute\b|\bhandler\b|\bexport default\b/.test(content)) {
    tags.add(GRAPH_EFFECT_ENTRYPOINT_TAG);
  }
  if (/\bconfig\b|\.json$|\.ya?ml$|\.toml$/i.test(relPath)) {
    tags.add(GRAPH_EFFECT_CONFIG_TAG);
  }
  if (!content || !lang) {
    tags.add(METADATA_ONLY_TAG);
  }
  return [...tags].sort();
}

function clusterKeyFor(relPath) {
  const parts = normalizePath(relPath).split('/');
  if (parts[0] === 'backend' && parts[1] === 'src') {
    return ['backend', parts[2] || 'root'].join('__');
  }
  if (parts[0] === 'frontend' && parts[1] === 'src') {
    return ['frontend', parts[2] || 'src', parts[3] || 'index'].join('__');
  }
  if (parts[0] === 'worker') {
    return ['worker', parts[1] || 'root'].join('__');
  }
  if (parts[0] === 'scripts') {
    return ['scripts', parts[1] || 'root', parts[2] || 'index'].join('__');
  }
  return [parts[0] || 'root', parts[1] || 'root'].join('__');
}

function buildFacts(sourcePath, content, relPath, tags, relations, lang, omitBody) {
  const facts = [
    `file-extension:${extname(sourcePath).toLowerCase() || 'none'}`,
    `surface:${surfaceFor(relPath)}`,
    `risk:${riskFor(relPath, content)}`,
    `language:${lang || 'text'}`,
    `payload:${omitBody ? 'metadata-only' : 'full-text'}`,
  ];
  for (const tag of tags) {
    facts.push(`tag:${tag}`);
  }
  for (const relation of relations.slice(0, 80)) {
    facts.push(`dependency:${relation.source}`);
  }
  return facts;
}

function buildRelationsSection(relations) {
  if (!relations.length) {
    return ['## Conexoes do codigo', '', 'Nenhuma conexao interna detectada.', ''];
  }
  return [
    '## Conexoes do codigo',
    '',
    ...relations.map((relation) => `- ${relation.link} via \`${relation.specifier}\``),
    '',
  ];
}

function writeAtomicIfChanged(filePath, content) {
  const dirPath = dirname(filePath);
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
  if (existsSync(filePath) && readFileSync(filePath, 'utf8') === content) {
    return false;
  }
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, filePath);
  return true;
}

export function mirrorFile(sourcePath, manifest) {
  try {
    const relPath = normalizePath(relative(REPO_ROOT, sourcePath));
    const sourceSize = statSync(sourcePath).size;
    const omitBody = sourceSize > SOURCE_BODY_MIRROR_MAX_BYTES;
    const content = omitBody ? '' : readFileSync(sourcePath, 'utf8');
    const hash = omitBody ? sha256File(sourcePath) : sha256(content);
    const mirrorPath = sourceToMirrorPath(sourcePath);
    const lang = detectLanguage(sourcePath);
    const gitState = gitStateForSource(sourcePath);
    const relations = omitBody ? [] : extractRelations(content, sourcePath);
    const tags = tagsFor(relPath, content, gitState, relations, lang);
    const facts = buildFacts(sourcePath, content, relPath, tags, relations, lang, omitBody);
    const now = new Date().toISOString();
    const body = [
      '---',
      `source: ${yamlScalar(relPath)}`,
      `repo_root: ${yamlScalar(REPO_ROOT)}`,
      `mirror_format: 21`,
      `sha256: ${hash}`,
      `bytes: ${sourceSize}`,
      `lang: ${yamlScalar(lang || 'text')}`,
      `git_dirty: ${gitState.dirty}`,
      `git_local_commit: ${gitState.localCommit}`,
      `workspace_state: ${gitState.workspaceState}`,
      `mirror_payload: ${omitBody ? 'metadata_only' : 'full_text'}`,
      `machine_surface: ${surfaceFor(relPath)}`,
      `machine_risk: ${riskFor(relPath, content)}`,
      `machine_cluster: ${yamlScalar(clusterKeyFor(relPath))}`,
      'machine_kinds: []',
      ...frontmatterList('tags', tags),
      `mirrored: ${now}`,
      `internal_links: ${relations.length}`,
      ...frontmatterList('visual_facts', facts),
      '---',
      '',
      `# ${basename(relPath)}`,
      '',
      `Source: \`${relPath}\``,
      '',
      ...buildRelationsSection(relations),
      omitBody ? '_Source body omitted because it exceeds mirror size limit._' : `\`\`\`${lang}\n${content}\n\`\`\``,
      '',
    ].join('\n');

    const changed = writeAtomicIfChanged(mirrorPath, body);
    const relMirror = normalizePath(relative(SOURCE_MIRROR_DIR, mirrorPath));
    manifest.files[relMirror] = {
      source: relPath,
      hash,
      source_size: sourceSize,
      mirror_size: Buffer.byteLength(body, 'utf8'),
      lang: lang || 'text',
      git_dirty: gitState.dirty,
      git_local_commit: gitState.localCommit,
      workspace_state: gitState.workspaceState,
      mirror_payload: omitBody ? 'metadata_only' : 'full_text',
      machine_surface: surfaceFor(relPath),
      machine_risk: riskFor(relPath, content),
      machine_cluster: clusterKeyFor(relPath),
      machine_kinds: [],
      machine_tags: tags,
      format_version: 21,
      internal_links: relations.length,
      links_to: relations.map((relation) => relation.source),
      visual_facts: facts,
      updated: now,
    };
    return { status: changed ? 'updated' : 'unchanged', mirrorPath };
  } catch (error) {
    return { status: 'error', reason: error.message };
  }
}
