import * as path from 'path';
import { ensureDir, pathExists, statPath, writeTextFile } from '../../safe-fs';
import type { PluginKind, PluginRegistry, PulsePlugin } from '../../types.plugin-system';
import { discoverPlugins } from './schema-discovery';

const ARTIFACT_FILE_NAME = 'PULSE_PLUGIN_REGISTRY.json';
const PLUGINS_DIR_NAME = 'plugins';
const DOMAIN_PACK_PREFIX = 'domain-pack-';

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

export function isDomainPack(pluginId: string, _rootDir: string): boolean {
  return pluginId.startsWith(DOMAIN_PACK_PREFIX);
}

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
