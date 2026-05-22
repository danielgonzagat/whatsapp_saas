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

