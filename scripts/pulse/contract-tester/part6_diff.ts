/**
 * Part 6: API schema diff detection and endpoint classification.
 */

import type { ContractTestEvidence, SchemaDiff } from '../../types.contract-tester';
import type { PulseStructuralGraph } from '../../types.structural';
import { pathExists, readTextFile } from '../../safe-fs';
import { safeJoin } from '../../lib/safe-path';
import { walkFiles } from '../../parsers/utils';
import {
  discoverAllObservedArtifactFilenames,
  discoverSourceExtensionsFromObservedTypescript,
} from '../../dynamic-reality-kernel/token-evidence';
import { isNodeKind, CONTRACT_EVIDENCE_FILENAME, resolveSeverityLabel } from './part0_constants';
import {
  findBackendDir,
  findControllerPrefix,
  collectRouteDecorators,
  normalizeRoute,
  parseSourceFile,
} from './part1_helpers';

interface EndpointDescriptor {
  method: string;
  endpoint: string;
}

function extractNodeHttpMethod(node: {
  metadata: Record<string, unknown>;
  label?: string;
}): string | null {
  const metaMethod = node.metadata['method'];
  if (typeof metaMethod === 'string') return metaMethod.toUpperCase();
  const metaHttp = node.metadata['httpMethod'];
  if (typeof metaHttp === 'string') return metaHttp.toUpperCase();
  const metaVerb = node.metadata['httpVerb'];
  if (typeof metaVerb === 'string') return metaVerb.toUpperCase();
  const label = node.label ?? '';
  const match = label.match(/^(?:GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD|ALL)\b/i);
  if (match) return match[0].toUpperCase();
  return null;
}

function extractNodeRoute(node: {
  metadata: Record<string, unknown>;
  label?: string;
}): string | null {
  const metaRoute = node.metadata['route'];
  if (typeof metaRoute === 'string') return metaRoute;
  const metaPath = node.metadata['path'];
  if (typeof metaPath === 'string') return metaPath;
  const metaFullPath = node.metadata['fullPath'];
  if (typeof metaFullPath === 'string') return metaFullPath;
  const label = node.label ?? '';
  const match = label.match(/^(?:GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD|ALL)\s+(\S+)/i);
  if (match) return match[1];
  return null;
}

function scanEndpointsFromSource(rootDir: string): EndpointDescriptor[] {
  const backendDir = findBackendDir(rootDir);
  if (!backendDir) return [];
  const endpoints: EndpointDescriptor[] = [];
  const files = walkFiles(backendDir, [...discoverSourceExtensionsFromObservedTypescript()]);
  const seen = new Set<string>();
  for (const filePath of files) {
    let content: string;
    try {
      content = readTextFile(filePath, 'utf8');
    } catch {
      continue;
    }
    const source = parseSourceFile(filePath, content);
    const prefix = findControllerPrefix(source);
    for (const routeDefinition of collectRouteDecorators(source)) {
      const routePart = normalizeRoute(routeDefinition.route);
      const fullRoute =
        prefix + (routePart.startsWith('/') || prefix.endsWith('/') ? '' : '/') + routePart;
      const normalized = normalizeRoute(fullRoute);
      const key = `${routeDefinition.method} ${normalized}`;
      if (seen.has(key)) continue;
      seen.add(key);
      endpoints.push({ method: routeDefinition.method, endpoint: normalized });
    }
  }
  return endpoints;
}

function loadCurrentEndpoints(rootDir: string): EndpointDescriptor[] {
  const structuralPath = safeJoin(
    rootDir,
    '.pulse',
    'current',
    discoverAllObservedArtifactFilenames().structuralGraph,
  );
  if (pathExists(structuralPath)) {
    try {
      const raw = readTextFile(structuralPath, 'utf-8');
      const graph: PulseStructuralGraph = JSON.parse(raw);
      const endpoints: EndpointDescriptor[] = [];
      for (const node of graph.nodes) {
        if (isNodeKind(node.kind, 'backend_route') || isNodeKind(node.kind, 'proxy_route')) {
          const method = extractNodeHttpMethod(node);
          const route = extractNodeRoute(node);
          if (method && route) endpoints.push({ method, endpoint: normalizeRoute(route) });
        }
      }
      return endpoints;
    } catch {
      /* fall through */
    }
  }
  return scanEndpointsFromSource(rootDir);
}

function loadPreviousContractEvidence(rootDir: string): ContractTestEvidence | null {
  const evidencePath = safeJoin(rootDir, '.pulse', 'current', CONTRACT_EVIDENCE_FILENAME);
  if (!pathExists(evidencePath)) return null;
  try {
    const raw = readTextFile(evidencePath, 'utf-8');
    return JSON.parse(raw) as ContractTestEvidence;
  } catch {
    return null;
  }
}

export function checkAPISchemaDiff(rootDir: string): SchemaDiff[] {
  const diffs: SchemaDiff[] = [];
  const currentEndpoints = loadCurrentEndpoints(rootDir);
  const previousEvidence = loadPreviousContractEvidence(rootDir);
  if (!previousEvidence || previousEvidence.contracts.length === 0) {
    const internal = currentEndpoints.filter((e) => isInternalEndpoint(e.endpoint));
    for (const endpoint of internal) {
      const key = `${endpoint.method} ${endpoint.endpoint}`;
      diffs.push({
        endpoint: key,
        severity: resolveSeverityLabel((l) => l === 'addition'),
        field: 'endpoint',
        before: null,
        after: endpoint.method,
        description: `New endpoint discovered: ${key}`,
      });
    }
    return diffs;
  }
  const previousInternal = previousEvidence.contracts.filter((c) => c.provider === 'internal_api');
  const prevKeys = new Set(previousInternal.map((c) => `${c.method} ${c.endpoint}`));
  const currKeys = new Set(currentEndpoints.map((e) => `${e.method} ${e.endpoint}`));
  for (const key of prevKeys) {
    if (!currKeys.has(key)) {
      diffs.push({
        endpoint: key,
        severity: resolveSeverityLabel((l) => l === 'breaking'),
        field: 'endpoint',
        before: key,
        after: null,
        description: `Endpoint removed: ${key} was present in the previous snapshot`,
      });
    }
  }
  for (const key of currKeys) {
    if (!prevKeys.has(key)) {
      diffs.push({
        endpoint: key,
        severity: resolveSeverityLabel((l) => l === 'addition'),
        field: 'endpoint',
        before: null,
        after: key,
        description: `New endpoint added: ${key}`,
      });
    }
  }
  return diffs;
}

export function isInternalEndpoint(endpoint: string): boolean {
  const normalized = normalizeRoute(endpoint);
  if (normalized === '/') return true;
  if (/^https?:\/\//i.test(normalized) || normalized.startsWith('//')) return false;
  return normalized.startsWith('/');
}
