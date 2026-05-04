import type { Dirent } from 'fs';

import type { ProviderContract } from '../../types.contract-tester';
import { readTextFile, pathExists, readDir } from '../../safe-fs';
import { safeJoin } from '../../lib/safe-path';
import {
  providerFromUrl,
  normalizeEndpoint,
  uniqueStrings,
  readMethodFromContext,
  readHeadersFromContext,
  readSchemaFromContext,
  discoverContractsFromOpenApi,
} from './helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UrlObservation {
  url: string;
  method: string | null;
  headers: string[];
  requestSchema: Record<string, unknown> | null;
  responseSchema: Record<string, unknown> | null;
  context: string;
}

// ---------------------------------------------------------------------------
// URL observation collection
// ---------------------------------------------------------------------------

export function collectUrlObservations(value: unknown): UrlObservation[] {
  const observations: UrlObservation[] = [];
  const seen = new Set<string>();

  const visit = (current: unknown, context: Record<string, unknown>, keyPath: string): void => {
    if (typeof current === 'string') {
      for (const url of extractExternalUrls(current)) {
        const method = readMethodFromContext(context);
        const normalizedKey = `${method ?? 'GET'} ${url}`;
        if (seen.has(normalizedKey)) continue;
        seen.add(normalizedKey);
        observations.push({
          url,
          method,
          headers: readHeadersFromContext(context),
          requestSchema: readSchemaFromContext(context, 'request'),
          responseSchema: readSchemaFromContext(context, 'response'),
          context: keyPath,
        });
      }
      return;
    }

    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, context, `${keyPath}[${index}]`));
      return;
    }

    if (current && typeof current === 'object') {
      const objectValue = current as Record<string, unknown>;
      for (const [key, child] of Object.entries(objectValue)) {
        visit(child, objectValue, keyPath ? `${keyPath}.${key}` : key);
      }
    }
  };

  visit(value, {}, '');
  return observations;
}

function isUrlTokenCharacter(char: string): boolean {
  if (!char) return false;
  return !["'", '"', '`', '<', '>', ')', '\\'].includes(char) && !/\s/.test(char);
}

function extractExternalUrls(value: string): string[] {
  const urls: string[] = [];
  const schemes = ['http://', 'https://'];
  let cursor = 0;

  while (cursor < value.length) {
    const nextStarts = schemes
      .map((scheme) => ({ scheme, index: value.indexOf(scheme, cursor) }))
      .filter((entry) => entry.index >= 0)
      .sort((a, b) => a.index - b.index);

    const next = nextStarts[0];
    if (!next) break;

    let end = next.index + next.scheme.length;
    while (end < value.length && isUrlTokenCharacter(value[end])) {
      end++;
    }

    const candidate = value.slice(next.index, end);
    if (providerFromUrl(candidate)) {
      urls.push(candidate);
    }
    cursor = end;
  }

  return urls;
}

function inferAuthTypeFromObservation(observation: UrlObservation): ProviderContract['authType'] {
  const serialized = JSON.stringify({
    headers: observation.headers,
    requestSchema: observation.requestSchema,
    responseSchema: observation.responseSchema,
    context: observation.context,
  }).toLowerCase();

  if (serialized.includes('signature')) return 'webhook_signature';
  if (serialized.includes('bearer') || serialized.includes('authorization')) return 'bearer';
  if (serialized.includes('oauth')) return 'oauth2';
  if (serialized.includes('api_key') || serialized.includes('apikey')) return 'api_key';
  return 'none';
}

function isPulseRuntimeArtifactFile(fileName: string): boolean {
  return (
    fileName.startsWith('PULSE_') &&
    fileName.endsWith('.json') &&
    fileName !== 'PULSE_CONTRACT_EVIDENCE.json'
  );
}

// ---------------------------------------------------------------------------
// Contract deduplication
// ---------------------------------------------------------------------------

function dedupeContracts(contracts: ProviderContract[]): ProviderContract[] {
  const byKey = new Map<string, ProviderContract>();

  for (const contract of contracts) {
    const key = `${contract.method} ${contract.provider}${contract.endpoint}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, contract);
      continue;
    }

    byKey.set(key, {
      ...existing,
      expectedRequestSchema:
        Object.keys(existing.expectedRequestSchema).length > 0
          ? existing.expectedRequestSchema
          : contract.expectedRequestSchema,
      expectedResponseSchema:
        Object.keys(existing.expectedResponseSchema).length > 0
          ? existing.expectedResponseSchema
          : contract.expectedResponseSchema,
      expectedHeaders: uniqueStrings([...existing.expectedHeaders, ...contract.expectedHeaders]),
      authType: existing.authType === 'none' ? contract.authType : existing.authType,
      issues: uniqueStrings([...existing.issues, ...contract.issues]),
    });
  }

  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// Runtime artifact discovery
// ---------------------------------------------------------------------------

function discoverContractsFromRuntimeArtifacts(rootDir: string): ProviderContract[] {
  const pulseDir = safeJoin(rootDir, '.pulse', 'current');
  if (!pathExists(pulseDir)) return [];

  let entries: (string | Dirent)[];
  try {
    entries = readDir(pulseDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const contracts: ProviderContract[] = [];
  for (const entry of entries) {
    if (typeof entry === 'string' || !entry.isFile() || !isPulseRuntimeArtifactFile(entry.name)) {
      continue;
    }

    const artifactPath = safeJoin(pulseDir, entry.name);
    let artifact: unknown;
    try {
      artifact = JSON.parse(readTextFile(artifactPath, 'utf8'));
    } catch {
      continue;
    }

    for (const observation of collectUrlObservations(artifact)) {
      const provider = providerFromUrl(observation.url);
      if (!provider) continue;

      contracts.push({
        provider,
        endpoint: normalizeEndpoint(observation.url, provider),
        method: observation.method ?? 'GET',
        expectedRequestSchema: observation.requestSchema ?? {},
        expectedResponseSchema: observation.responseSchema ?? {},
        expectedHeaders: observation.headers,
        authType: inferAuthTypeFromObservation(observation),
        status: 'generated',
        lastValidated: null,
        issues: [`Discovered from runtime artifact ${entry.name}`],
      });
    }
  }

  return dedupeContracts(contracts);
}

// ---------------------------------------------------------------------------
// Graph artifact discovery
// ---------------------------------------------------------------------------

function discoverContractsFromGraphArtifacts(rootDir: string): ProviderContract[] {
  const graphFiles = ['PULSE_STRUCTURAL_GRAPH.json', 'PULSE_BEHAVIOR_GRAPH.json'];
  const contracts: ProviderContract[] = [];

  for (const fileName of graphFiles) {
    const filePath = safeJoin(rootDir, '.pulse', 'current', fileName);
    if (!pathExists(filePath)) continue;

    let graph: unknown;
    try {
      graph = JSON.parse(readTextFile(filePath, 'utf8'));
    } catch {
      continue;
    }

    for (const observation of collectUrlObservations(graph)) {
      const provider = providerFromUrl(observation.url);
      if (!provider) continue;

      contracts.push({
        provider,
        endpoint: normalizeEndpoint(observation.url, provider),
        method: observation.method ?? 'GET',
        expectedRequestSchema: observation.requestSchema ?? {},
        expectedResponseSchema: observation.responseSchema ?? {},
        expectedHeaders: observation.headers,
        authType: inferAuthTypeFromObservation(observation),
        status: 'generated',
        lastValidated: null,
        issues: [`Discovered from graph artifact ${fileName}`],
      });
    }
  }

  return dedupeContracts(contracts);
}

export function discoverContracts(rootDir: string): ProviderContract[] {
  return dedupeContracts([
    ...discoverContractsFromOpenApi(rootDir),
    ...discoverContractsFromRuntimeArtifacts(rootDir),
    ...discoverContractsFromGraphArtifacts(rootDir),
  ]);
}
