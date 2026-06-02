import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SINGLE_TOOL_CALL_ENV = 'ATOMIC_SINGLE_TOOL_CALL';
export const SINGLE_TOOL_NAME_ENV = 'ATOMIC_SINGLE_TOOL_NAME';
export const SINGLE_TOOL_ARGS_ENV = 'ATOMIC_SINGLE_TOOL_ARGS_JSON';
export const DISABLE_HOT_RELOAD_ENV = 'ATOMIC_DISABLE_HOT_RELOAD';
export const FORCE_HOT_RELOAD_ENV = 'ATOMIC_FORCE_HOT_RELOAD';

const MAX_CHILD_OUTPUT = 50 * 1024 * 1024;

type ToolCallback = (args: unknown, extra: unknown) => unknown | Promise<unknown>;
type RegisterTool = (name: string, config: unknown, callback: ToolCallback) => unknown;

interface ToolServerLike {
  registerTool: RegisterTool;
}

export type HotToolRegistry = Map<string, ToolCallback>;

export interface FreshnessResult {
  fresh: boolean;
  reason?: string;
  distHash?: string;
  manifestDistHash?: string | null;
}

interface HotReloadOptions {
  atomicRoot?: string;
  env?: NodeJS.ProcessEnv;
  log?: (...parts: unknown[]) => void;
  shouldDelegate?: (toolName: string) => boolean;
  callFreshTool?: (toolName: string, args: unknown) => Promise<unknown>;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function atomicRootFromModule(metaUrl = import.meta.url): string {
  const here = path.dirname(fileURLToPath(metaUrl));
  return path.basename(here) === 'dist' ? path.dirname(here) : here;
}

function repoRootFromAtomicRoot(atomicRoot: string): string {
  return path.resolve(atomicRoot, '..', '..', '..');
}

function distHashOf(freshness: FreshnessResult): string | null {
  return typeof freshness.distHash === 'string' ? freshness.distHash : null;
}

export function readDistFreshness(atomicRoot = atomicRootFromModule()): FreshnessResult {
  const check = spawnSync(process.execPath, [path.join(atomicRoot, 'dist-freshness.mjs'), '--check'], {
    cwd: atomicRoot,
    encoding: 'utf8',
    maxBuffer: MAX_CHILD_OUTPUT,
  });
  const parsed = parseJsonObject(check.stdout.trim());
  if (parsed && typeof parsed.fresh === 'boolean') return parsed as unknown as FreshnessResult;
  return {
    fresh: false,
    reason: `freshness check failed: status=${check.status ?? 'signal'} stderr=${check.stderr.trim()}`,
  };
}

export function ensureFreshDist(atomicRoot = atomicRootFromModule()): FreshnessResult {
  const before = readDistFreshness(atomicRoot);
  if (before.fresh) return before;

  const build = spawnSync(process.execPath, [path.join(atomicRoot, 'build.mjs')], {
    cwd: atomicRoot,
    encoding: 'utf8',
    maxBuffer: MAX_CHILD_OUTPUT,
  });
  if (build.status !== 0) {
    throw new Error(`Atomic rebuild failed: status=${build.status ?? 'signal'} stderr=${build.stderr.trim()}`);
  }

  const after = readDistFreshness(atomicRoot);
  if (!after.fresh) {
    throw new Error(`Atomic dist remains stale after rebuild: ${after.reason ?? 'unknown freshness failure'}`);
  }
  return after;
}

async function defaultCallFreshTool(atomicRoot: string, env: NodeJS.ProcessEnv, toolName: string, args: unknown): Promise<unknown> {
  ensureFreshDist(atomicRoot);
  const repoRoot = repoRootFromAtomicRoot(atomicRoot);
  const child = spawnSync(process.execPath, [path.join(atomicRoot, 'dist', 'server.js')], {
    cwd: repoRoot,
    env: {
      ...env,
      [SINGLE_TOOL_CALL_ENV]: '1',
      [SINGLE_TOOL_NAME_ENV]: toolName,
      [SINGLE_TOOL_ARGS_ENV]: JSON.stringify(args ?? {}),
      [DISABLE_HOT_RELOAD_ENV]: '1',
      CODEX_PROJECT_DIR: env.CODEX_PROJECT_DIR ?? repoRoot,
      TMPDIR: env.TMPDIR ?? repoRoot,
      TMP: env.TMP ?? repoRoot,
      TEMP: env.TEMP ?? repoRoot,
    },
    encoding: 'utf8',
    maxBuffer: MAX_CHILD_OUTPUT,
  });

  const parsed = parseJsonObject(child.stdout.trim());
  if (child.status !== 0 || !parsed || parsed.ok !== true) {
    throw new Error(
      `fresh Atomic tool call failed for ${toolName}: status=${child.status ?? 'signal'} stdout=${child.stdout.trim()} stderr=${child.stderr.trim()}`,
    );
  }
  return parsed.result;
}

export async function callFreshAtomicTool(atomicRoot: string, env: NodeJS.ProcessEnv, toolName: string, args: unknown): Promise<unknown> {
  return defaultCallFreshTool(atomicRoot, env, toolName, args);
}

export function shouldDelegateToFreshRuntimeState(
  bootDistHash: string | null,
  current: FreshnessResult,
  env: NodeJS.ProcessEnv,
): boolean {
  if (env[DISABLE_HOT_RELOAD_ENV] === '1') return false;
  if (env[FORCE_HOT_RELOAD_ENV] === '1') return true;
  if (!current.fresh) return true;

  const currentDistHash = distHashOf(current);
  return Boolean(bootDistHash && currentDistHash && currentDistHash !== bootDistHash);
}

function shouldDelegateToFreshRuntime(atomicRoot: string, bootDistHash: string | null, env: NodeJS.ProcessEnv): boolean {
  return shouldDelegateToFreshRuntimeState(bootDistHash, readDistFreshness(atomicRoot), env);
}

export function installHotReloadingToolCallbacks(
  server: unknown,
  options: HotReloadOptions = {},
): HotToolRegistry {
  const atomicRoot = options.atomicRoot ?? atomicRootFromModule();
  const env = options.env ?? process.env;
  const bootDistHash = distHashOf(readDistFreshness(atomicRoot));
  const registry: HotToolRegistry = new Map();
  const target = server as ToolServerLike;
  const originalRegisterTool = target.registerTool.bind(target);

  target.registerTool = ((name: string, config: unknown, callback: ToolCallback): unknown => {
    registry.set(name, callback);
    const wrapped: ToolCallback = async (args, extra) => {
      const delegate = options.shouldDelegate
        ? options.shouldDelegate(name)
        : shouldDelegateToFreshRuntime(atomicRoot, bootDistHash, env);
      if (delegate) {
        options.log?.('hot-reload delegating', name, 'to fresh Atomic runtime');
        const callFresh = options.callFreshTool ?? ((tool, toolArgs) => defaultCallFreshTool(atomicRoot, env, tool, toolArgs));
        return callFresh(name, args);
      }
      return callback(args, extra);
    };
    return originalRegisterTool(name, config, wrapped);
  }) as RegisterTool;

  return registry;
}

export async function runSingleToolCallFromEnv(
  registry: HotToolRegistry,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (env[SINGLE_TOOL_CALL_ENV] !== '1') return false;

  const toolName = env[SINGLE_TOOL_NAME_ENV];
  if (!toolName) {
    process.stdout.write(JSON.stringify({ ok: false, error: `${SINGLE_TOOL_NAME_ENV} is required` }) + '\n');
    process.exitCode = 1;
    return true;
  }

  const callback = registry.get(toolName);
  if (!callback) {
    process.stdout.write(JSON.stringify({ ok: false, error: `unknown Atomic tool: ${toolName}` }) + '\n');
    process.exitCode = 1;
    return true;
  }

  let args: unknown = {};
  try {
    args = env[SINGLE_TOOL_ARGS_ENV] ? JSON.parse(env[SINGLE_TOOL_ARGS_ENV]) : {};
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: `invalid ${SINGLE_TOOL_ARGS_ENV}: ${error instanceof Error ? error.message : String(error)}` }) + '\n');
    process.exitCode = 1;
    return true;
  }

  try {
    const result = await callback(args, {});
    process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }) + '\n');
    process.exitCode = 1;
  }
  return true;
}
