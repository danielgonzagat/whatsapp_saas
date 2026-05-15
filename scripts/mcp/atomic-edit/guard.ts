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
export const REPO_ROOT = findRepoRoot(HERE);

/** Exact repo-relative paths that no AI CLI may modify. */
const PROTECTED_FILES = new Set<string>([
  "CLAUDE.md",
  "AGENTS.md",
  "docs/design/KLOEL_VISUAL_DESIGN_CONTRACT.md",
  "docs/design/KLOEL_ANTI_HARDCODE_CONTRACT.md",
  "ops/kloel-design-tokens.json",
  ".husky/pre-push",
  ".github/workflows/ci-cd.yml",
  "backend/eslint.config.mjs",
  "frontend/eslint.config.mjs",
  "worker/eslint.config.mjs",
  "backend/src/lib/ai-models.ts",
  "scripts/pulse/no-hardcoded-reality-audit.ts",
]);

/** Repo-relative prefixes/globs that are protected directory-wide. */
function isProtectedRelative(rel: string): string | null {
  if (PROTECTED_FILES.has(rel)) return rel;
  if (rel.startsWith("ops/") && rel.endsWith(".json")) return "ops/*.json";
  if (/^scripts\/ops\/check-[^/]+\.mjs$/.test(rel)) return "scripts/ops/check-*.mjs";
  if (/^scripts\/ops\/lib\/[^/]+\.mjs$/.test(rel)) return "scripts/ops/lib/*.mjs";
  return null;
}

export interface ResolvedTarget {
  absPath: string;
  relPath: string;
}

/**
 * Resolve a user-supplied path against the repo root and assert it is both
 * contained and not governance-protected. Throws with an actionable message
 * otherwise.
 */
export function resolveSafeTarget(file: string): ResolvedTarget {
  const abs = path.resolve(REPO_ROOT, file);
  const rel = path.relative(REPO_ROOT, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`refused: path escapes repo root (${file})`);
  }
  const hit = isProtectedRelative(rel.split(path.sep).join("/"));
  if (hit) {
    throw new Error(
      `refused: ${rel} is governance-protected (matches "${hit}" in CLAUDE.md). ` +
        `Only the repo owner may change it — ask, do not bypass.`,
    );
  }
  return { absPath: abs, relPath: rel.split(path.sep).join("/") };
}
