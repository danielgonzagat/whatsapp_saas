/** Flow discovery and backend-capability inference for codebase-truth. */

import type {
  BackendRoute,
  PulseDiscoveredFlowCandidate,
  PulseDiscoveredModule,
  PulseManifest,
} from './types';
import type { InteractionChain, PageFunctionalMap } from './functional-map-types';
import {
  shouldIgnoreSemanticToken,
  singularize,
  slugify,
  titleCase,
  tokenize,
  unique,
} from './codebase-truth-tokens';
import { buildPageSemanticProfile, buildGenericModuleAlias } from './codebase-truth-module';

function isUserFacingGroup(group: string): boolean {
  return group === 'main' || group === 'public' || group === 'checkout';
}

export function isLikelyMutation(interaction: InteractionChain): boolean {
  if (!interaction.apiCall) {
    return false;
  }
  if (interaction.apiCall.method && interaction.apiCall.method.toUpperCase() !== 'GET') {
    return true;
  }
  return /\b(save|create|update|delete|remove|add|send|submit|pay|upload|sync|connect|approve|withdraw|checkout)\b/i.test(
    `${interaction.elementLabel} ${interaction.handler || ''} ${interaction.apiCall.endpoint}`,
  );
}

function scoreDeclaredMatch(tokensA: string[], tokensB: string[]): number {
  const setB = new Set(tokensB);
  return tokensA.filter((token) => setB.has(token)).length;
}

function matchDeclaredFlow(
  candidate: Omit<PulseDiscoveredFlowCandidate, 'declaredFlow'>,
  manifest: PulseManifest | null,
): string | null {
  if (!manifest) {
    return null;
  }

  const candidateTokens = unique([
    ...tokenize(candidate.moduleName),
    ...tokenize(candidate.moduleKey),
    ...tokenize(candidate.pageRoute),
    ...tokenize(candidate.elementLabel),
    ...tokenize(candidate.endpoint),
    ...tokenize(candidate.backendRoute || ''),
    ...(candidate.semanticTokens || []),
  ]);

  let best: { id: string; score: number } | null = null;

  for (const spec of manifest.flowSpecs) {
    const specTokens = unique([
      ...tokenize(spec.id),
      ...tokenize(spec.notes),
      ...tokenize(spec.surface),
      ...tokenize(spec.oracle),
      ...tokenize(spec.runner),
    ]);
    const score = scoreDeclaredMatch(candidateTokens, specTokens);
    if (score > (best?.score || 0)) {
      best = { id: spec.id, score };
    }
  }

  return best && best.score >= 2 ? best.id : null;
}

export function buildDiscoveredFlows(
  pages: PageFunctionalMap[],
  manifest: PulseManifest | null,
): PulseDiscoveredFlowCandidate[] {
  const byId = new Map<string, PulseDiscoveredFlowCandidate>();

  for (const page of pages) {
    if (!isUserFacingGroup(page.group)) {
      continue;
    }
    const semanticProfile = buildPageSemanticProfile(page);
    const moduleAlias = buildGenericModuleAlias(
      page.route,
      page.group,
      semanticProfile.orderedTokens,
      semanticProfile.structuralTokens,
      semanticProfile.rootTokens,
      semanticProfile.dominantRoot,
    );

    for (const interaction of page.interactions) {
      if (!isLikelyMutation(interaction) || !interaction.apiCall) {
        continue;
      }

      const endpoint = interaction.backendRoute?.fullPath || interaction.apiCall.endpoint;
      const flowId = slugify(`${moduleAlias.key}-${interaction.apiCall.method}-${endpoint}`);
      if (!flowId) {
        continue;
      }

      const current = byId.get(flowId);
      const base = {
        id: flowId,
        moduleKey: moduleAlias.key,
        moduleName: moduleAlias.name,
        pageRoute: page.route,
        elementLabel: interaction.elementLabel,
        httpMethod: interaction.apiCall.method,
        endpoint,
        backendRoute: interaction.backendRoute?.fullPath || null,
        connected: !!interaction.backendRoute,
        persistent: interaction.prismaModels.length > 0,
        semanticTokens: unique([
          ...semanticProfile.orderedTokens,
          ...tokenize(interaction.elementLabel),
          ...tokenize(interaction.handler || ''),
          ...tokenize(endpoint),
          ...tokenize(interaction.backendRoute?.fullPath || ''),
          ...tokenize(interaction.serviceMethod?.serviceName || ''),
          ...tokenize(interaction.serviceMethod?.methodName || ''),
          ...interaction.prismaModels.flatMap(tokenize),
        ]),
      };

      if (current) {
        current.connected = current.connected || base.connected;
        current.persistent = current.persistent || base.persistent;
        if (current.elementLabel === '(sem texto)' && base.elementLabel !== '(sem texto)') {
          current.elementLabel = base.elementLabel;
        }
        current.semanticTokens = unique([
          ...(current.semanticTokens || []),
          ...base.semanticTokens,
        ]);
        continue;
      }

      byId.set(flowId, {
        ...base,
        declaredFlow: null,
      });
    }
  }

  const flows = [...byId.values()];
  for (const candidate of flows) {
    candidate.declaredFlow = matchDeclaredFlow(candidate, manifest);
  }

  return flows.sort((a, b) => a.id.localeCompare(b.id));
}

export function inferBackendCapabilityWithoutFrontendSurface(
  backendRoutes: BackendRoute[],
  discoveredModules: PulseDiscoveredModule[],
): string[] {
  const discoveredKeys = new Set(discoveredModules.map((item) => item.key));
  const counts = new Map<string, { name: string; count: number }>();

  for (const route of backendRoutes) {
    const segments = route.fullPath
      .replace(/^\/+/g, '')
      .split('/')
      .filter(Boolean)
      .filter((segment) => !segment.startsWith(':'))
      .filter((segment) => !['api', 'v1', 'kloel'].includes(segment.toLowerCase()));

    const root = unique(
      segments
        .flatMap((segment) => tokenize(segment))
        .flatMap((segment) => [segment, singularize(segment)])
        .filter((segment) => !shouldIgnoreSemanticToken(segment)),
    )[0];
    if (!root) {
      continue;
    }
    const key = slugify(root);
    const name = titleCase(root);
    const current = counts.get(key);
    counts.set(key, {
      name,
      count: (current?.count || 0) + 1,
    });
  }

  return [...counts.entries()]
    .filter(([key, value]) => key !== 'misc' && value.count >= 3 && !discoveredKeys.has(key))
    .sort((a, b) => b[1].count - a[1].count)
    .map(([, value]) => `${value.name} (${value.count} routes)`);
}
