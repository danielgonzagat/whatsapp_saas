// PULSE — Live Codebase Nervous System
// Universal Plugin Architecture (Wave 9)

import * as path from 'path';
import * as fs from 'fs';

import { ensureDir, pathExists, statPath, writeTextFile } from './safe-fs';
import type { PluginKind, PluginRegistry, PulsePlugin } from './types.plugin-system';

const ARTIFACT_FILE_NAME = 'PULSE_PLUGIN_REGISTRY.json';
const PLUGINS_DIR_NAME = 'plugins';
const DOMAIN_PACK_PREFIX = 'domain-pack-';

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
export function discoverPlugins(
  rootDir: string,
): Array<{ id: string; path: string; kind: PluginKind }> {
  const discovered: Array<{ id: string; path: string; kind: PluginKind }> = [];

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

      const kind = inferPluginKind(entry.name, pluginDir);
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
function inferPluginKind(dirName: string, _pluginDir: string): PluginKind {
  if (dirName.startsWith('parser-')) return 'parser';
  if (dirName.startsWith('adapter-')) return 'adapter';
  if (dirName.startsWith('evidence-')) return 'evidence_provider';
  if (dirName.startsWith('gate-')) return 'gate_provider';
  if (dirName.startsWith('executor-')) return 'executor';
  if (dirName.startsWith('domain-pack-')) return 'domain_pack';
  return 'parser';
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
  try {
    const mod = require(pluginPath);
    const plugin = mod.default ?? mod;
    return validatePlugin(plugin) ? plugin : null;
  } catch {
    return null;
  }
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
  const plugins: PluginRegistry['plugins'] = [];
  let loadedCount = 0;
  let failedCount = 0;

  for (const desc of discovered) {
    const plugin = loadPlugin(desc.path);
    const sourceMtime = pathExists(desc.path) ? statPath(desc.path).mtime.toISOString() : null;
    const entrypoint = path.relative(rootDir, desc.path);

    if (plugin) {
      plugins.push({
        id: desc.id,
        kind: desc.kind,
        loaded: true,
        error: null,
        entrypoint,
        sourceMtime,
        proof: `loaded ${desc.kind} plugin from filesystem entrypoint`,
      });
      loadedCount++;
    } else {
      plugins.push({
        id: desc.id,
        kind: desc.kind,
        loaded: false,
        error: `Failed to load plugin from ${desc.path}`,
        entrypoint,
        sourceMtime,
        proof: `discovered ${desc.kind} plugin entrypoint but module contract validation failed`,
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
          : `${discovered.length} plugin entrypoint(s) discovered from scripts/pulse/${PLUGINS_DIR_NAME}; ${loadedCount} loaded`,
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
