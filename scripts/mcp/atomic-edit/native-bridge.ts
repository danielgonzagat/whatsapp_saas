/**
 * native-bridge.ts — parent-side client for the isolated pi-natives engine.
 *
 * Owns a forked child process (native-worker.mjs) that hosts the universal
 * tree-sitter / ast-grep engine (75 languages). All access is async RPC over
 * the IPC channel, with a per-request timeout (a hung parse kills + respawns
 * the child) and crash containment (a native segfault kills only the child;
 * the parent degrades and callers fall back to the TS / lang-bridge path).
 *
 * FIREWALL LAW: this bridge is PERCEPTION + CHANGE-COMPUTATION only. astEditDry
 * returns computed spans (the child forces dryRun, so the addon never writes).
 * Persistence happens exclusively through the atomic Mutation Firewall in the
 * tool handlers (resolveSafeTarget -> guardSha -> validate -> commit).
 *
 * Every method degrades gracefully: when the native engine is unavailable
 * (wrong-platform binary, repeated crashes) calls reject and callers MUST fall
 * back to the existing implementation. pi-natives is a dev-machine accelerator,
 * never on the critical path.
 */
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ─────────────────────────── napi contracts ───────────────────────────

export type AstMatchStrictness = 'cst' | 'smart' | 'ast' | 'relaxed' | 'signature' | 'template';

export interface AstFindOptions {
  patterns?: string[];
  lang?: string;
  path?: string;
  glob?: string;
  selector?: string;
  strictness?: AstMatchStrictness;
  limit?: number;
  offset?: number;
  includeMeta?: boolean;
  timeoutMs?: number;
}
export interface AstFindMatch {
  path: string;
  text?: string;
  byteStart: number;
  byteEnd: number;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  metaVariables?: Record<string, unknown>;
}
export interface AstFindResult {
  matches: AstFindMatch[];
  totalMatches: number;
  filesWithMatches: number;
  filesSearched: number;
  limitReached: boolean;
  parseErrors?: string[];
}
export interface AstReplaceOptions {
  rewrites?: Record<string, string>;
  lang?: string;
  path?: string;
  glob?: string;
  selector?: string;
  strictness?: AstMatchStrictness;
  maxReplacements?: number;
  maxFiles?: number;
  failOnParseError?: boolean;
  timeoutMs?: number;
}
export interface AstReplaceChange {
  path: string;
  before: string;
  after: string;
  byteStart: number;
  byteEnd: number;
  deletedLength: number;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}
export interface AstReplaceResult {
  changes: AstReplaceChange[];
  fileChanges: { path: string; count: number }[];
  totalReplacements: number;
  filesTouched: number;
  filesSearched: number;
  applied: boolean;
  limitReached: boolean;
  parseErrors?: string[];
}

// ─────────────────────────── fork-RPC client ───────────────────────────

const WORKER_PATH = fileURLToPath(new URL('./native-worker.mjs', import.meta.url));
const MAX_CRASHES = 3;

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let child: ChildProcess | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let ready = false;
let available = false;
let languages: string[] = [];
let degraded = false;
let consecutiveCrashes = 0;
let readyResolvers: ((v: boolean) => void)[] = [];

function flushReady(value: boolean): void {
  const rs = readyResolvers;
  readyResolvers = [];
  for (const r of rs) r(value);
}

function onDead(): void {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error('native worker died'));
  }
  pending.clear();
  child = null;
  ready = false;
  consecutiveCrashes += 1;
  if (consecutiveCrashes >= MAX_CRASHES) degraded = true;
  flushReady(false);
}

function spawnChild(): void {
  if (child || degraded) return;
  try {
    child = fork(WORKER_PATH, [], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'], execArgv: [] });
  } catch {
    child = null;
    degraded = true;
    return;
  }
  child.on(
    'message',
    (msg: {
      type?: string;
      id?: number;
      ok?: boolean;
      result?: unknown;
      error?: string;
      available?: boolean;
      languages?: string[];
    }) => {
      if (msg?.type === 'ready') {
        ready = true;
        available = Boolean(msg.available);
        languages = msg.languages ?? [];
        consecutiveCrashes = 0;
        flushReady(available);
        return;
      }
      if (typeof msg?.id !== 'number') return;
      const p = pending.get(msg.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error || 'native error'));
    },
  );
  child.on('exit', onDead);
  child.on('error', onDead);
}

/** Fork + wait for the worker to report readiness. Returns native availability. */
export function ensureReady(timeoutMs = 8000): Promise<boolean> {
  if (degraded) return Promise.resolve(false);
  if (ready) return Promise.resolve(available);
  spawnChild();
  if (!child) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(available), timeoutMs);
    readyResolvers.push((v) => {
      clearTimeout(timer);
      resolve(v);
    });
  });
}

function call<T>(op: string, args: unknown, timeoutMs = 15000): Promise<T> {
  if (degraded) return Promise.reject(new Error('native bridge degraded'));
  spawnChild();
  if (!child) return Promise.reject(new Error('native worker unavailable'));
  const id = nextId++;
  const activeChild = child;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      try {
        activeChild.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      reject(new Error(`native op ${op} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    try {
      activeChild.send({ id, op, args });
    } catch (e) {
      clearTimeout(timer);
      pending.delete(id);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

// ─────────────────────────── public API ───────────────────────────

/** True when the native engine is loadable + responsive (after ensureReady). */
export function nativeAvailable(): boolean {
  return available && !degraded;
}

/** Languages the native engine can parse (populated after ensureReady). */
export function nativeLanguages(): string[] {
  return languages.slice();
}

/** Universal structural search (ast-grep) across 75 languages. */
export function astGrep(opts: AstFindOptions): Promise<AstFindResult> {
  return call<AstFindResult>('astGrep', opts, opts.timeoutMs ?? 15000);
}

/**
 * Universal structural change COMPUTATION (ast-grep rewrite). Always dry-run on
 * the native side — returns the spans + before/after text to be applied by the
 * caller through the Mutation Firewall. Never writes.
 */
export function astEditDry(opts: AstReplaceOptions): Promise<AstReplaceResult> {
  return call<AstReplaceResult>('astEdit', opts, opts.timeoutMs ?? 15000);
}

/** Universal code summary / outline (tree-sitter) for any supported language. */
export function summarize(opts: Record<string, unknown>): Promise<Record<string, unknown>> {
  return call<Record<string, unknown>>('summarizeCode', opts, 15000);
}

export interface GrepMatch {
  path: string;
  lineNumber: number;
  line: string;
}
export interface GrepResult {
  matches: GrepMatch[];
  totalMatches: number;
  filesWithMatches: number;
  filesSearched: number;
  limitReached: boolean;
}
/** Native ripgrep search (read-only) across files/dirs. Beats a shell grep on speed + structure. */
export function nativeGrep(opts: Record<string, unknown>): Promise<GrepResult> {
  return call<GrepResult>('grep', opts, 15000);
}

export interface GlobMatch {
  path: string;
  fileType: number;
}
export interface GlobResult {
  matches: GlobMatch[];
  totalMatches: number;
}
/** Native glob file discovery (read-only), gitignore-aware. */
export function nativeGlob(opts: Record<string, unknown>): Promise<GlobResult> {
  return call<GlobResult>('glob', opts, 15000);
}

/** Release the worker (used by tests / shutdown). */
export function disposeNative(): void {
  if (child) {
    try {
      child.removeAllListeners();
      child.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  }
  child = null;
  ready = false;
}
