// PULSE — Live Codebase Nervous System
// Universal Plugin Architecture (Wave 9)

import * as path from 'path';
import * as fs from 'fs';
import * as ts from 'typescript';

import { ensureDir, pathExists, statPath, writeTextFile } from './safe-fs';
import type { PluginKind, PluginRegistry, PulsePlugin } from './types.plugin-system';

const ARTIFACT_FILE_NAME = 'PULSE_PLUGIN_REGISTRY.json';
const PLUGINS_DIR_NAME = 'plugins';
const DOMAIN_PACK_PREFIX = 'domain-pack-';
const pluginKindSchemaCache = new Map<string, Set<string>>();

interface PluginDescriptor {
  id: string;
  path: string;
  kind: PluginKind;
}

type PluginLoadStatus = 'loaded' | 'contract_invalid' | 'load_failed' | 'execution_failed';

interface PluginExecutionProbe {
  name: 'discover' | 'link' | 'evidence' | 'gates';
  status: 'pass' | 'fail' | 'not_run';
  count: number;
  error: string | null;
}

type PluginRegistryEntry = PluginRegistry['plugins'][number] & {
  status: PluginLoadStatus;
  execution: PluginExecutionProbe[];
};

function findPulseDir(startDir: string): string {
  let current = startDir;
  while (current !== path.dirname(current)) {
    const candidate = path.join(current, 'types.plugin-system.ts');
    if (pathExists(candidate)) {
      return current;
    }
    current = path.dirname(current);
  }
  return startDir;
}

function pluginKindSchema(pulseDir: string): Set<string> {
  const cached = pluginKindSchemaCache.get(pulseDir);
  if (cached) {
    return cached;
  }

  const schema = new Set<string>();
  const sourcePath = path.join(pulseDir, 'types.plugin-system.ts');
  try {
    const source = fs.readFileSync(sourcePath, 'utf8');
    const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
    sourceFile.forEachChild((node) => {
      if (!ts.isTypeAliasDeclaration(node) || node.name.text !== 'PluginKind') {
        return;
      }
      const typeNodes = ts.isUnionTypeNode(node.type) ? node.type.types : [node.type];
      for (const typeNode of typeNodes) {
        if (ts.isLiteralTypeNode(typeNode) && ts.isStringLiteral(typeNode.literal)) {
          schema.add(typeNode.literal.text);
        }
      }
    });
  } catch {
    // Missing schema keeps the registry fail-closed at the individual plugin.
  }
  pluginKindSchemaCache.set(pulseDir, schema);
  return schema;
}

function asPluginKind(value: string, pulseDir: string): PluginKind | null {
  return pluginKindSchema(pulseDir).has(value) ? (value as PluginKind) : null;
}

function readDeclaredPluginKind(pluginDir: string): PluginKind | null {
  const indexPath = path.join(pluginDir, 'index.ts');
  if (!pathExists(indexPath)) {
    return null;
  }

  try {
    const source = fs.readFileSync(indexPath, 'utf8');
    const sourceFile = ts.createSourceFile(indexPath, source, ts.ScriptTarget.Latest, true);
    let declaredKind: string | null = null;
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAssignment(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'kind' &&
        ts.isStringLiteralLike(node.initializer)
      ) {
        declaredKind = node.initializer.text;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return declaredKind ? asPluginKind(declaredKind, findPulseDir(pluginDir)) : null;
  } catch {
    return null;
  }
}

/**
 * Discover all available plugins from the filesystem.
 *
 * Scans `scripts/pulse/plugins/` for subdirectories containing an index.ts
 * entry point. Domain packs are allowed, but they must be present on disk; the
 * PULSE core does not seed product/domain reality from built-in lists.
 *
 * @param rootDir - Repository root directory
 * @returns Array of discovered plugin descriptors with their kind
 */
export function discoverPlugins(rootDir: string): PluginDescriptor[] {
  const discovered: PluginDescriptor[] = [];

  const pluginsDir = path.join(rootDir, 'scripts', 'pulse', PLUGINS_DIR_NAME);

  if (pathExists(pluginsDir)) {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
    } catch {
      return discovered;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const pluginDir = path.join(pluginsDir, entry.name);
      const indexPath = path.join(pluginDir, 'index.ts');

      if (!pathExists(indexPath)) {
        continue;
      }

      const kind = readDeclaredPluginKind(pluginDir) ?? inferPluginKind(entry.name, pluginDir);
      discovered.push({
        id: entry.name,
        path: indexPath,
        kind,
      });
    }
  }

  return discovered;
}

/**
 * Infer the plugin kind from its directory name and contents.
 *
 * Uses naming conventions to classify plugins:
 *   - `parser-*` → `parser`
 *   - `adapter-*` → `adapter`
 *   - `evidence-*` → `evidence_provider`
 *   - `gate-*` → `gate_provider`
 *   - `executor-*` → `executor`
 *   - `domain-pack-*` → `domain_pack`
 *
 * @param dirName - Plugin directory name
 * @param _pluginDir - Plugin directory path (reserved for future use)
 * @returns Inferred plugin kind
 */
function inferPluginKind(dirName: string, pluginDir: string): PluginKind {
  const pulseDir = findPulseDir(pluginDir);
  const normalizedName = dirName
    .toLowerCase()
    .split('')
    .map((char) => (char === '_' || char === ':' ? '-' : char))
    .join('');
  const kinds = [...pluginKindSchema(pulseDir)];
  for (const kind of kinds) {
    const kindTokens = kind
      .toLowerCase()
      .split('')
      .map((char) => (char === '_' || char === '-' ? ' ' : char))
      .join('')
      .split(' ')
      .filter(Boolean);
    const normalizedKind = kind.split('_').join('-');
    if (
      normalizedName.startsWith(`${normalizedKind}-`) ||
      kindTokens.every((token) => normalizedName.includes(token))
    ) {
      const pluginKind = asPluginKind(kind, pulseDir);
      if (pluginKind) {
        return pluginKind;
      }
    }
  }
  const fallback = asPluginKind(kinds[0] ?? '', pulseDir);
  if (!fallback) {
    throw new Error(`Plugin kind schema could not be discovered from ${pulseDir}`);
  }
  return fallback;
}

/**
 * Load a single plugin module from its file path.
 *
 * Attempts to require the module and extract a default export that
 * conforms to the PulsePlugin interface.
 *
 * @param pluginPath - Absolute path to the plugin's index.ts
 * @returns The loaded plugin instance, or null if loading fails
 */
export function loadPlugin(pluginPath: string): PulsePlugin | null {
  return loadPluginAttempt(pluginPath).plugin;
}

function loadPluginAttempt(pluginPath: string): {
  plugin: PulsePlugin | null;
  error: string | null;
  status: Extract<PluginLoadStatus, 'loaded' | 'contract_invalid' | 'load_failed'>;
} {
  try {
    const mod = require(pluginPath);
    const plugin = mod.default ?? mod;
    if (validatePlugin(plugin)) {
      return { plugin, error: null, status: 'loaded' };
    }
    return {
      plugin: null,
      error: 'Plugin module loaded but did not satisfy PulsePlugin contract.',
      status: 'contract_invalid',
    };
  } catch (error) {
    return {
      plugin: null,
      error: error instanceof Error ? error.message : String(error),
      status: 'load_failed',
    };
  }
}

function runPluginExecutionProbe(
  plugin: PulsePlugin,
  name: PluginExecutionProbe['name'],
  nodes: ReturnType<PulsePlugin['discover']>,
): PluginExecutionProbe {
  try {
    const result = name === 'link' ? plugin.link(nodes) : plugin[name]();
    return {
      name,
      status: 'pass',
      count: Array.isArray(result) ? result.length : 0,
      error: null,
    };
  } catch (error) {
    return {
      name,
      status: 'fail',
      count: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function executePlugin(plugin: PulsePlugin): PluginExecutionProbe[] {
  let nodes: ReturnType<PulsePlugin['discover']> = [];
  const discoverProbe = (() => {
    try {
      nodes = plugin.discover();
      return {
        name: 'discover' as const,
        status: 'pass' as const,
        count: nodes.length,
        error: null,
      };
    } catch (error) {
      return {
        name: 'discover' as const,
        status: 'fail' as const,
        count: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  })();
  return [
    discoverProbe,
    runPluginExecutionProbe(plugin, 'link', nodes),
    runPluginExecutionProbe(plugin, 'evidence', nodes),
    runPluginExecutionProbe(plugin, 'gates', nodes),
  ];
}

/**
 * Validate that an object conforms to the PulsePlugin interface.
 *
 * Checks that all required methods (discover, link, evidence, gates)
 * are present and callable.
 *
 * @param obj - Object to validate
 * @returns Whether the object is a valid PulsePlugin
 */
function validatePlugin(obj: unknown): obj is PulsePlugin {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const candidate = obj as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.kind === 'string' &&
    typeof candidate.version === 'string' &&
    typeof candidate.discover === 'function' &&
    typeof candidate.link === 'function' &&
    typeof candidate.evidence === 'function' &&
    typeof candidate.gates === 'function'
  );
}

/**
 * Check whether a plugin id is a domain pack.
 *
 * Domain packs are identified by their `domain-pack-` prefix.
 *
 * @param pluginId - Plugin identifier
 * @param _rootDir - Repository root directory (reserved for future use)
 * @returns Whether the plugin is a domain pack
 */
export function isDomainPack(pluginId: string, _rootDir: string): boolean {
  return pluginId.startsWith(DOMAIN_PACK_PREFIX);
}

/**
 * Build the full plugin registry by discovering and loading all plugins.
 *
 * Discovers plugins from the filesystem, attempts to load each one, and
 * records the load status (loaded or failed).
 * The resulting registry is persisted to `.pulse/current/PULSE_PLUGIN_REGISTRY.json`.
 *
 * @param rootDir - Repository root directory
 * @returns Registry snapshot with per-plugin load status
 */
export function loadPluginRegistry(rootDir: string): PluginRegistry {
  const discovered = discoverPlugins(rootDir);
  const plugins: PluginRegistryEntry[] = [];
  let loadedCount = 0;
  let failedCount = 0;
  let executionFailedCount = 0;

  for (const desc of discovered) {
    const loadAttempt = loadPluginAttempt(desc.path);
    const plugin = loadAttempt.plugin;
    const sourceMtime = pathExists(desc.path) ? statPath(desc.path).mtime.toISOString() : null;
    const entrypoint = path.relative(rootDir, desc.path);

    if (plugin) {
      const execution = executePlugin(plugin);
      const executionFailed = execution.some((probe) => probe.status === 'fail');
      if (executionFailed) {
        executionFailedCount++;
      }
      plugins.push({
        id: desc.id,
        kind: plugin.kind,
        loaded: !executionFailed,
        status: executionFailed ? 'execution_failed' : 'loaded',
        error:
          execution
            .filter((probe) => probe.error)
            .map((probe) => `${probe.name}: ${probe.error}`)
            .join('; ') || null,
        entrypoint,
        sourceMtime,
        proof: executionFailed
          ? `loaded ${plugin.kind} plugin contract but execution probe failed`
          : `loaded ${plugin.kind} plugin from filesystem entrypoint and executed lifecycle probes`,
        execution,
      });
      if (executionFailed) {
        failedCount++;
      } else {
        loadedCount++;
      }
    } else {
      plugins.push({
        id: desc.id,
        kind: desc.kind,
        loaded: false,
        status: loadAttempt.status,
        error: loadAttempt.error ?? `Failed to load plugin from ${desc.path}`,
        entrypoint,
        sourceMtime,
        proof: `discovered ${desc.kind} plugin entrypoint but module did not execute`,
        execution: [
          { name: 'discover', status: 'not_run', count: 0, error: null },
          { name: 'link', status: 'not_run', count: 0, error: null },
          { name: 'evidence', status: 'not_run', count: 0, error: null },
          { name: 'gates', status: 'not_run', count: 0, error: null },
        ],
      });
      failedCount++;
    }
  }

  const generatedAt = new Date().toISOString();
  const newestMtimeMs = discovered
    .map((desc) => (pathExists(desc.path) ? statPath(desc.path).mtimeMs : 0))
    .reduce((max, value) => Math.max(max, value), 0);
  const freshnessMinutes =
    newestMtimeMs > 0 ? Math.max(0, Math.round((Date.now() - newestMtimeMs) / 60000)) : 0;
  const healthStatus = discovered.length === 0 ? 'missing' : failedCount === 0 ? 'pass' : 'partial';

  const registry: PluginRegistry = {
    generatedAt,
    plugins,
    health: {
      status: healthStatus,
      generatedAt,
      discoveredAt: generatedAt,
      freshnessMinutes,
      proof:
        discovered.length === 0
          ? `No plugin entrypoints found under scripts/pulse/${PLUGINS_DIR_NAME}`
          : `${discovered.length} plugin entrypoint(s) discovered from scripts/pulse/${PLUGINS_DIR_NAME}; ${loadedCount} executed; ${executionFailedCount} failed lifecycle execution`,
    },
    summary: {
      total: discovered.length,
      loaded: loadedCount,
      failed: failedCount,
    },
  };

  const pulseDir = path.join(rootDir, '.pulse', 'current');
  ensureDir(pulseDir, { recursive: true });
  writeTextFile(path.join(pulseDir, ARTIFACT_FILE_NAME), JSON.stringify(registry, null, 2));

  return registry;
}
