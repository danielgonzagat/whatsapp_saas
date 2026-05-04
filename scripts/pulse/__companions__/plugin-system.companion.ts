import * as path from 'path';
import type { PluginRegistry } from '../types.plugin-system';
import type { PluginRegistryEntry } from '../plugin-system';
import { discoverPlugins } from '../plugin-system';
import { loadPluginAttempt } from '../plugin-system';
import { executePlugin } from '../plugin-system';
import { PLUGINS_DIR_NAME } from '../plugin-system';
import { ARTIFACT_FILE_NAME } from '../plugin-system';
import { ensureDir, pathExists, statPath, writeTextFile } from '../safe-fs';

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
