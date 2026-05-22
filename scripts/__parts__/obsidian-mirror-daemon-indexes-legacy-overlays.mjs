import { join, relative, dirname } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { REPO_ROOT, SOURCE_MIRROR_DIR, GENERATED_PAGE_SIZE, CLUSTER_DIR, MACHINE_DIR, CAMERA_DIR, VISUAL_FACT_DIR } from '../obsidian-mirror-daemon-constants.mjs';
import { applyGraphDerivedTags } from './obsidian-mirror-daemon-indexes-notes.mjs';
import { removeGeneratedGraphOverlays } from './obsidian-mirror-daemon-indexes-camera.mjs';
import { writeSignalNotes, writeDomainIndexes } from './obsidian-mirror-daemon-indexes-domain-write.mjs';
import { writeMachineIndexes, writeClusterIndexes } from './obsidian-mirror-daemon-indexes-machine.mjs';
import { writeGeneratedNote, buildVisualFactNote, listGeneratedMarkdownRelPaths } from './obsidian-mirror-daemon-indexes-notes.mjs';
import { isTestSource } from './obsidian-mirror-daemon-content.mjs';

/** Legacy writeGeneratedIndexes body — preserved but not invoked. */
export function legacyWriteGeneratedIndexesBody(manifest) {
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
