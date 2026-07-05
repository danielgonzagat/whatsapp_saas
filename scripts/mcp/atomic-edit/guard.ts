/**
 * Path safety guard for the atomic-edit MCP server.
 *
 * The blunt built-in editors have no notion of repo governance — this server
 * ADDS that safety (strengthening, not weakening, the action space):
 *   - every target must resolve inside the repo root (no path escape);
 *   - governance/quality-infra files listed as PROTECTED in CLAUDE.md are
 *     read-only to any AI CLI and are refused here, hard.
 *
 * The protected set is duplicated here intentionally and explicitly: this is
 * a security boundary, so it must not depend on parsing a Markdown doc at
 * runtime. Keep in sync with the "ARQUIVOS PROTEGIDOS" section of CLAUDE.md.
 */

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Anchor to the real repo root by walking up for a `.git` marker. Counting
 * fixed `../..` from this file is fragile: it breaks the moment the file runs
 * from a different depth (e.g. compiled into dist/ vs. source). Walking to the
 * marker is location-independent — correct under tsx (source) and node (dist).
 */
function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start, "..", "..", ".."); // last-resort
    dir = parent;
  }
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Optional explicit root override (dynamic scope rooting): when set, the OS
// operates rooted at that dir instead of where its code lives. Lets a harness/
// worktree arm run the SAME OS binary while resolving relative paths against -
// and being sandboxed to - its own tree, never the code's repo.
const ROOT_OVERRIDE = process.env.ATOMIC_EDIT_REPO_ROOT?.trim();
const HOST_WRITE_ROOT = process.env.ATOMIC_HOST_WRITE_ROOT?.trim();
const ENV_WORKSPACE_ROOT =
  process.env.ATOMIC_WORKSPACE_ROOT?.trim() || process.env.ATOMIC_DECLARED_WORKSPACE_ROOT?.trim() || '';
export const REPO_ROOT = canonicalPath(ROOT_OVERRIDE ? ROOT_OVERRIDE : findRepoRoot(HERE));

let sessionWorkspaceRoot: string | null = null;

interface IntentScopePolicyFile {
  reason?: unknown;
  allowedMutationPaths?: unknown;
  forbiddenMutationPaths?: unknown;
}

interface LoadedIntentScopePolicy {
  policyPath: string;
  reason: string | null;
  allowedMutationPaths: string[];
  forbiddenMutationPaths: string[];
}

let cachedIntentScopePolicy: {
  workspaceRoot: string;
  policyPath: string;
  mtimeMs: number | null;
  policy: LoadedIntentScopePolicy | null;
} | null = null;

function normalizeScopePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+/g, "/").replace(/^\/+/g, "");
}

function scopeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => normalizeScopePath(item.trim()));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^\x24{}()|[\]\\]/g, "\\$&");
}

function scopePatternMatches(pattern: string, relPath: string): boolean {
  const normalizedPattern = normalizeScopePath(pattern);
  const rel = normalizeScopePath(relPath);
  if (!normalizedPattern || normalizedPattern === "**" || normalizedPattern === "**/*") return true;
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return rel === prefix || rel.startsWith(prefix + "/");
  }
  if (!normalizedPattern.includes("*")) {
    return rel === normalizedPattern || rel.startsWith(normalizedPattern + "/");
  }
  const source = normalizedPattern
    .split("/")
    .map((segment) => (segment === "**" ? ".*" : escapeRegex(segment).replaceAll("\\*", "[^/]*")))
    .join("/");
  return new RegExp("^" + source + "$").test(rel);
}

function readIntentScopePolicy(workspaceRoot: string): LoadedIntentScopePolicy | null {
  const policyPath = path.join(workspaceRoot, ".atomic", "intent-scope.json");
  let stat: fs.Stats;
  try {
    stat = fs.statSync(policyPath);
  } catch {
    cachedIntentScopePolicy = { workspaceRoot, policyPath, mtimeMs: null, policy: null };
    return null;
  }
  if (cachedIntentScopePolicy?.workspaceRoot === workspaceRoot && cachedIntentScopePolicy.mtimeMs === stat.mtimeMs) {
    return cachedIntentScopePolicy.policy;
  }
  let parsed: IntentScopePolicyFile;
  try {
    parsed = JSON.parse(fs.readFileSync(policyPath, "utf8")) as IntentScopePolicyFile;
  } catch (error) {
    throw new Error(
      "atomic intent scope policy is not valid JSON at " + policyPath + ": " + (error instanceof Error ? error.message : String(error)),
    );
  }
  const policy: LoadedIntentScopePolicy = {
    policyPath,
    reason: typeof parsed.reason === "string" && parsed.reason.trim().length > 0 ? parsed.reason.trim() : null,
    allowedMutationPaths: scopeStringList(parsed.allowedMutationPaths),
    forbiddenMutationPaths: scopeStringList(parsed.forbiddenMutationPaths),
  };
  cachedIntentScopePolicy = { workspaceRoot, policyPath, mtimeMs: stat.mtimeMs, policy };
  return policy;
}

function activeWorkspaceRel(absPath: string): string | null {
  const workspaceRoot = activeWorkspaceRoot();
  const rel = path.relative(workspaceRoot, canonicalPath(absPath));
  if (rel === "") return ".";
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return normalizeScopePath(rel);
}

export function intentScopeStatus(): { policyPath: string; policy: LoadedIntentScopePolicy | null } {
  const workspaceRoot = activeWorkspaceRoot();
  const policy = readIntentScopePolicy(workspaceRoot);
  return { policyPath: path.join(workspaceRoot, ".atomic", "intent-scope.json"), policy };
}

export function assertIntentMutationAllowed(absPath: string, subject = "mutation"): void {
  const workspaceRoot = activeWorkspaceRoot();
  const policy = readIntentScopePolicy(workspaceRoot);
  if (!policy) return;
  const rel = activeWorkspaceRel(absPath);
  if (rel === null || rel.startsWith(".atomic/")) return;
  const forbidden = policy.forbiddenMutationPaths.find((pattern) => scopePatternMatches(pattern, rel));
  if (forbidden) {
    throw new Error(
      "atomic " + subject + " refused by intent scope: " + rel + " matches forbiddenMutationPaths entry " +
        JSON.stringify(forbidden) + " from " + policy.policyPath + ".",
    );
  }
  if (policy.allowedMutationPaths.length > 0 && !policy.allowedMutationPaths.some((pattern) => scopePatternMatches(pattern, rel))) {
    throw new Error(
      "atomic " + subject + " refused by intent scope: " + rel + " is outside allowedMutationPaths from " +
        policy.policyPath + ". Allowed: " + policy.allowedMutationPaths.join(", "),
    );
  }
}

function nearestExistingPath(target: string): { existing: string; suffix: string[] } | null {
  let cursor = path.resolve(target);
  const suffix: string[] = [];
  for (;;) {
    if (fs.existsSync(cursor)) return { existing: cursor, suffix };
    const parent = path.dirname(cursor);
    if (parent === cursor) return null;
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
}

function hostVisiblePath(target: string): string | null {
  if (!HOST_WRITE_ROOT) return null;
  const hostRoot = path.resolve(HOST_WRITE_ROOT);
  let hostReal: string;
  try {
    hostReal = fs.realpathSync.native(hostRoot);
  } catch {
    return null;
  }
  const targetExisting = nearestExistingPath(target);
  if (!targetExisting) return null;
  let existingReal: string;
  try {
    existingReal = fs.realpathSync.native(targetExisting.existing);
  } catch {
    return null;
  }
  if (!containsPath(hostReal, existingReal)) return null;
  return path.join(hostRoot, path.relative(hostReal, existingReal), ...targetExisting.suffix);
}

function canonicalPath(target: string): string {
  const resolved = path.resolve(target);
  const hostVisible = hostVisiblePath(resolved);
  if (hostVisible) return hostVisible;
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function uniqueResolved(roots: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const root of roots) {
    if (root.trim().length === 0) continue;
    const resolved = canonicalPath(root);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    result.push(resolved);
  }
  return result;
}

function envAllowedRoots(): string[] {
  const value = process.env.ATOMIC_EDIT_ALLOWED_ROOTS;
  if (!value) return [];
  return value.split(path.delimiter).map((entry) => entry.trim()).filter(Boolean);
}

function gitWorktreeRoots(): string[] {
  try {
    const output = childProcess.execFileSync(
      "git",
      ["-C", REPO_ROOT, "worktree", "list", "--porcelain"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return output
      .split(/\r?\n/)
      .filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice("worktree ".length).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function allowedRepoRoots(): string[] {
  // Explicit root override = sandbox: ONLY that root (+ any explicit
  // ATOMIC_EDIT_ALLOWED_ROOTS), never the sibling-worktree list. Prevents an
  // arm rooted at a worktree from reaching the main repo or sibling worktrees.
  const roots = ROOT_OVERRIDE
    ? [REPO_ROOT, ...envAllowedRoots()]
    : [REPO_ROOT, ...gitWorktreeRoots(), ...envAllowedRoots()];
  return uniqueResolved(roots).sort((a, b) => b.length - a.length);
}

function containsPath(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function resolveAllowedRootForAbsolutePath(absPath: string): string | null {
  const abs = canonicalPath(absPath);
  return allowedRepoRoots().find((root) => containsPath(root, abs)) ?? null;
}

function workspaceRootCandidate(): string | null {
  return sessionWorkspaceRoot ?? validatedEnvWorkspaceRoot();
}

function validatedEnvWorkspaceRoot(): string | null {
  if (!ENV_WORKSPACE_ROOT) return null;
  try {
    return validateWorkspaceRoot(ENV_WORKSPACE_ROOT);
  } catch {
    return null;
  }
}

function validateWorkspaceRoot(rawRoot: string): string {
  const abs = canonicalPath(path.isAbsolute(rawRoot) ? rawRoot : path.resolve(REPO_ROOT, rawRoot));
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error(`atomic workspace root does not exist or is not a directory: ${rawRoot}`);
  }
  const containingRoot = resolveAllowedRootForAbsolutePath(abs);
  if (!containingRoot) {
    throw new Error(
      `atomic workspace root escapes allowed roots (${rawRoot}). ` +
        `Allowed roots: ${allowedRepoRoots().join(", ")}`,
    );
  }
  return abs;
}

export function activeWorkspaceRoot(): string {
  if (sessionWorkspaceRoot !== null) return sessionWorkspaceRoot;
  const envRoot = validatedEnvWorkspaceRoot();
  return envRoot ?? REPO_ROOT;
}

export function workspaceBindingStatus(): Record<string, unknown> {
  const envRoot = validatedEnvWorkspaceRoot();
  const intentScope = intentScopeStatus();
  return {
    repoRoot: REPO_ROOT,
    activeWorkspaceRoot: activeWorkspaceRoot(),
    declaredBy: sessionWorkspaceRoot !== null ? 'atomic_workspace_bind' : envRoot ? 'environment' : 'repo-root-default',
    envWorkspaceRoot: ENV_WORKSPACE_ROOT || null,
    sessionWorkspaceRoot,
    intentScopePolicyPath: intentScope.policyPath,
    intentScopePolicy: intentScope.policy,
  };
}

export function bindWorkspaceRoot(root: string): Record<string, unknown> {
  const next = validateWorkspaceRoot(root);
  const envRoot = validatedEnvWorkspaceRoot();
  if (envRoot && envRoot !== next) {
    throw new Error(
      `atomic workspace root already fixed by environment: ${envRoot}; refused conflicting bind to ${next}`,
    );
  }
  if (sessionWorkspaceRoot !== null && sessionWorkspaceRoot !== next) {
    throw new Error(`atomic workspace root already bound to ${sessionWorkspaceRoot}; refused conflicting bind to ${next}`);
  }
  sessionWorkspaceRoot = next;
  return workspaceBindingStatus();
}

export function assertInsideActiveWorkspace(absPath: string, subject = 'path'): void {
  if (!workspaceRootCandidate()) return;
  const workspaceRoot = activeWorkspaceRoot();
  const abs = canonicalPath(absPath);
  if (containsPath(workspaceRoot, abs)) return;
  throw new Error(
    `atomic ${subject} refused: resolved target ${abs} is outside declared workspace root ${workspaceRoot}. ` +
      `Pass an absolute path inside the workspace or bind the correct workspace before reading/editing/executing.`,
  );
}


function resolveTargetRoot(file: string): { absPath: string; repoRoot: string } {
  const baseRoot = activeWorkspaceRoot();
  const absPath = path.isAbsolute(file) ? canonicalPath(file) : canonicalPath(path.resolve(baseRoot, file));
  assertInsideActiveWorkspace(absPath, 'target');
  const repoRoot = resolveAllowedRootForAbsolutePath(absPath);
  if (!repoRoot) {
    throw new Error(
      `refused: path escapes allowed atomic edit roots (${file}). ` +
        `Allowed roots: ${allowedRepoRoots().join(", ")}`,
    );
  }
  return { absPath, repoRoot };
}


/** Exact repo-relative paths that no AI CLI may modify. */
const PROTECTED_FILES = new Set<string>([
  "AGENTS.md",
  "CLAUDE.md",
  "CODEX.md",
  ".codacy.yml",
  "ratchet.json",
  "package.json",
  ".husky/commit-msg",
  ".husky/pre-push",
  "backend/eslint.config.mjs",
  "frontend/eslint.config.mjs",
  "worker/eslint.config.mjs",
  "backend/src/lib/openai-models.ts",
  "backend/src/lib/ai-models.ts",
  "scripts/pulse/no-hardcoded-reality-audit.ts",
]);

const PROTECTED_PREFIXES = [
  ".github/workflows/",
  "docs/codacy/",
  "docs/design/",
  "ops/",
  "scripts/ops/check",
];

/** Owner-approval / exception ledger files inside ops/ that atomic MAY append to
 *  (the sanctioned channels for recording owner-approved deletions/exceptions).
 *  The governing policy files (kloel-ai-constitution.json, protected-governance-
 *  files.json) stay protected — only these append-only approval ledgers open. */
const EDITABLE_GOVERNANCE_APPROVALS = new Set<string>([
  "ops/visual-contract-exceptions.json",
  "ops/test-deletion-approvals.json",
  "ops/skipped-tests-approvals.json",
]);

/** Repo-relative prefixes/globs that are protected directory-wide. */
export function isProtectedRelative(rel: string): string | null {
  if (
    EDITABLE_GOVERNANCE_APPROVALS.has(rel) ||
    /^ops\/[a-z0-9-]+-(?:exceptions|approvals)\.json$/.test(rel)
  )
    return null;
  if (PROTECTED_FILES.has(rel)) return rel;
  for (const prefix of PROTECTED_PREFIXES) {
    if (rel.startsWith(prefix)) return prefix;
  }
  return null;
}

export interface ResolvedTarget {
  absPath: string;
  relPath: string;
  repoRoot: string;
}

/**
 * Resolve a user-supplied path against an allowed repo root and assert it is
 * both contained and not governance-protected. Relative paths still target the
 * MCP server root. Absolute paths may target any registered git worktree for
 * this repo, which lets delegated workers operate in isolated worktrees without
 * mutating the coordinator's checkout.
 */
export function resolveSafeTarget(file: string): ResolvedTarget {
  const { absPath, repoRoot } = resolveTargetRoot(file);
  const rel = path.relative(repoRoot, absPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`refused: path escapes resolved repo root (${file})`);
  }
  const relPath = rel.split(path.sep).join("/");
  const hit = isProtectedRelative(relPath);
  if (hit) {
    throw new Error(
      `refused: ${relPath} is governance-protected (matches "${hit}" in CLAUDE.md). ` +
        `Only the repo owner may change it — ask, do not bypass.`,
    );
  }
  return { absPath, relPath, repoRoot };
}
