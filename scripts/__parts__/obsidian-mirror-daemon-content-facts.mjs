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
