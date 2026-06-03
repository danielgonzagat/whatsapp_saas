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
// worktree arm run the SAME OS binary while resolving relative paths against —
// and being sandboxed to — its own tree, never the code's repo.
const ROOT_OVERRIDE = process.env.ATOMIC_EDIT_REPO_ROOT?.trim();
const HOST_WRITE_ROOT = process.env.ATOMIC_HOST_WRITE_ROOT?.trim();
export const REPO_ROOT = canonicalPath(ROOT_OVERRIDE ? ROOT_OVERRIDE : findRepoRoot(HERE));

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

function resolveTargetRoot(file: string): { absPath: string; repoRoot: string } {
  const absPath = path.isAbsolute(file) ? canonicalPath(file) : canonicalPath(path.resolve(REPO_ROOT, file));
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
  "scripts/ops/",
];

/** Repo-relative prefixes/globs that are protected directory-wide. */
export function isProtectedRelative(rel: string): string | null {
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
