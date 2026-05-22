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

