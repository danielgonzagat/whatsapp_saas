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


function diagnosticHasNearbyTest(entry, sourceSet, testSources) {
  if (isTestSource(entry.source)) {
    return true;
  }
  const source = entry.source;
  const ext = extname(source);
  const withoutExt = ext ? source.slice(0, -ext.length) : source;
  const candidates = [
    `${withoutExt}.spec${ext}`,
    `${withoutExt}.test${ext}`,
    `${dirname(source)}/__tests__/${basename(withoutExt)}.spec${ext}`,
    `${dirname(source)}/__tests__/${basename(withoutExt)}.test${ext}`,
  ].map(normalizePath);
  if (candidates.some((candidate) => sourceSet.has(candidate))) {
    return true;
  }
  const stem = basename(withoutExt).replace(
    /\.(controller|service|module|dto|route|page|component)$/i,
    '',
  );
  return stem.length > 3 && testSources.some((t) => t.includes(stem));
}

export function applyDiagnosticTags(manifest) {
  const all = Object.values(manifest.files);
  const sourceSet = new Set(all.map((e) => e.source));
  const testSources = all.filter((e) => isTestSource(e.source)).map((e) => e.source);
  const isExec = (s) =>
    /^(backend\/src|frontend\/src|frontend-admin\/src|worker\/|scripts\/pulse\/)/.test(s) &&
    !isTestSource(s);

  let changed = 0;
  for (const [relMirror, entry] of Object.entries(manifest.files)) {
    const kinds = entry.machine_kinds || [];
    const exec = isExec(entry.source);
    const noTest = !diagnosticHasNearbyTest(entry, sourceSet, testSources);

    let action = false;
    let evidence = false;
    // Every action/evidence signal is gated on executable code: a config
    // file (.yml/.json) marked "critical" has no test BY NATURE and is not
    // an actionable code TODO — flagging it would re-pollute the signal the
    // same way generated artifacts polluted the orphan ring.
    if (exec && kinds.includes('api-controller') && noTest) {
      action = true;
    }
    if (exec && entry.machine_risk === 'critical' && noTest) {
      action = true;
    }
    if (exec && entry.git_dirty && entry.machine_risk === 'critical') {
      action = true;
    }
    if (exec && entry.mirror_payload === 'metadata_only') {
      action = true;
    }
    if (exec && noTest) {
      evidence = true;
    }

    const tags = new Set(entry.machine_tags || []);
    const before = [...tags].sort().join(',');
    if (action) {
      tags.add(GRAPH_ACTION_REQUIRED_TAG);
    } else {
      tags.delete(GRAPH_ACTION_REQUIRED_TAG);
    }
    if (evidence) {
      tags.add(GRAPH_EVIDENCE_GAP_TAG);
    } else {
      tags.delete(GRAPH_EVIDENCE_GAP_TAG);
    }
    const next = [...tags];
    if (next.sort().join(',') === before) {
      continue;
    }

    entry.machine_tags = next;
    if (rewriteMirrorFrontmatterTags(relMirror, next)) {
      changed++;
    }
  }

  if (changed > 0) {
    log('OK', `Diagnostic action tags applied to ${changed} source points.`);
  }
}
