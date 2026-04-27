/**
 * Shared path validation helpers for PULSE scripts.
 *
 * These helpers exist to prevent path-traversal attacks where caller-derived
 * input (such as a `rootDir`, a relative artifact path, or a fixture filename)
 * could escape the expected boundary via `..` segments or absolute path
 * injection before being passed to `fs.*` APIs.
 *
 * Every fs operation in scripts/pulse and backend/src/pulse should route the
 * candidate path through {@link assertWithinRoot} (or one of the convenience
 * wrappers) so the trust boundary is centralised in this module. Static
 * analysis tools (Semgrep, Codacy) can therefore mark this single boundary as
 * the validated entry point instead of every call site individually.
 */
import * as path from 'path';

/**
 * Resolves `candidate` to an absolute path and asserts that it lives inside
 * `root`. The returned absolute path is safe to pass to fs APIs.
 *
 * @param candidate Path to validate (absolute or relative).
 * @param root      Trusted boundary directory (will be resolved/normalised).
 * @returns The resolved absolute path, guaranteed to live inside `root`.
 * @throws Error when the resolved path escapes `root`.
 */
export function assertWithinRoot(candidate: string, root: string): string {
  const resolved = path.resolve(candidate);
  const normalizedRoot = path.resolve(root);
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + path.sep)) {
    throw new Error(
      `Path traversal blocked: "${candidate}" resolves outside root "${normalizedRoot}"`,
    );
  }
  return resolved;
}

/**
 * Convenience wrapper that joins `segments` onto `root` and validates the
 * resulting path stays inside `root` before returning it.
 */
export function safeJoin(root: string, ...segments: string[]): string {
  return assertWithinRoot(path.join(root, ...segments), root);
}

/**
 * Joins a single segment onto a validated root, returning the full absolute
 * path. Equivalent to {@link safeJoin} but takes exactly one segment, which
 * matches the most common artifact-lookup pattern in PULSE scripts.
 */
export function safeResolveSegment(root: string, segment: string): string {
  return assertWithinRoot(path.resolve(root, segment), root);
}

/**
 * Normalises an arbitrary directory path into the absolute, canonical form
 * that {@link assertWithinRoot} expects as a root.
 */
export function resolveRoot(rootDir: string): string {
  return path.resolve(rootDir);
}
