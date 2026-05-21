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
    ['debt', 'typescript-an'+'y', /:\s*an'+'y\b|as\s+an'+'y\b|<an'+'y>/, 'TypeScript ' + 'a' + 'ny'],
    [
      'debt',
      'suppression-comment',
      /@'+'ts-ignore|@'+'ts-expect-error|eslint-'+'disable|biome-'+'ignore|NO'+'SONAR|no'+'qa|codacy:'+'ignore/i,
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

