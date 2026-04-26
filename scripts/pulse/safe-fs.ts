import * as fs from 'fs';
import * as path from 'path';

/**
 * Allow-listed roots for filesystem operations performed through this module.
 *
 * Every path that enters fs.* must resolve to live under one of these roots,
 * otherwise we throw a `PathOutsideAllowedRootError`. This protects against
 * directory-traversal sequences such as `../../etc/passwd` reaching the
 * underlying syscall.
 *
 * The repo root is auto-detected from this file's location; the OS tmp
 * directory and the home directory are accepted because PULSE artifacts and
 * scratch files legitimately land there during local runs and CI.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TMP_ROOT = path.resolve(require('os').tmpdir());
const HOME_ROOT = path.resolve(require('os').homedir());
const ALLOWED_ROOTS: readonly string[] = Object.freeze([REPO_ROOT, TMP_ROOT, HOME_ROOT]);

/** Thrown when a caller attempts to access a path outside the allowed roots. */
export class PathOutsideAllowedRootError extends Error {
  constructor(resolved: string) {
    super(`Refusing fs access outside allowed roots: ${resolved}`);
    this.name = 'PathOutsideAllowedRootError';
  }
}

/**
 * Resolve `filePath` to an absolute path and assert that it lives under one of
 * the {@link ALLOWED_ROOTS}. Returns the resolved absolute path so callers can
 * pass it to `fs.*` directly.
 */
function safeResolve(filePath: string): string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new TypeError('safe-fs: filePath must be a non-empty string');
  }
  const resolved = path.resolve(filePath);
  for (const root of ALLOWED_ROOTS) {
    if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) {
      return resolved;
    }
  }
  throw new PathOutsideAllowedRootError(resolved);
}

/** Path exists. */
export function pathExists(filePath: string): boolean {
  return fs.existsSync(safeResolve(filePath));
}

/** Stat path. */
export function statPath(filePath: string): fs.Stats {
  return fs.statSync(safeResolve(filePath));
}

/** Is directory. */
export function isDirectory(filePath: string): boolean {
  return statPath(filePath).isDirectory();
}

/** Read text file. */
export function readTextFile(filePath: string, encoding: BufferEncoding = 'utf8'): string {
  return fs.readFileSync(safeResolve(filePath), encoding);
}

/** Read json file. */
export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readTextFile(filePath)) as T;
}

/** Read dir. */
export function readDir(filePath: string): string[];
/** Read dir. */
export function readDir(filePath: string, options: { withFileTypes: true }): fs.Dirent[];
/** Read dir. */
export function readDir(filePath: string, options: { recursive: true }): string[];
/** Read dir. */
export function readDir(filePath: string, options?: unknown): unknown[] {
  return fs.readdirSync(safeResolve(filePath), options as never) as unknown[];
}

/** Ensure dir. */
export function ensureDir(filePath: string, options?: fs.MakeDirectoryOptions): void {
  fs.mkdirSync(safeResolve(filePath), options);
}

/** Write file (text or binary). */
export function writeFile(filePath: string, content: string | Buffer | Uint8Array): void {
  fs.writeFileSync(safeResolve(filePath), content);
}

/** Write text file. */
export function writeTextFile(filePath: string, content: string): void {
  writeFile(filePath, content);
}

/** Write binary file. */
export function writeBinaryFile(filePath: string, content: Buffer | Uint8Array): void {
  writeFile(filePath, content);
}

/** Remove path. */
export function removePath(filePath: string, options?: fs.RmOptions): void {
  fs.rmSync(safeResolve(filePath), options);
}

/** Remove file. */
export function removeFile(filePath: string): void {
  fs.unlinkSync(safeResolve(filePath));
}

/** Copy file. */
export function copyFile(sourcePath: string, targetPath: string): void {
  fs.copyFileSync(safeResolve(sourcePath), safeResolve(targetPath));
}

/** Rename path. */
export function renamePath(sourcePath: string, targetPath: string): void {
  fs.renameSync(safeResolve(sourcePath), safeResolve(targetPath));
}

/** Copy path. */
export function copyPath(
  sourcePath: string,
  targetPath: string,
  options?: fs.CopySyncOptions,
): void {
  fs.cpSync(safeResolve(sourcePath), safeResolve(targetPath), options);
}

/** Symlink dir. */
export function symlinkDir(sourcePath: string, targetPath: string): void {
  fs.symlinkSync(safeResolve(sourcePath), safeResolve(targetPath), 'dir');
}

/** Create append stream. */
export function createAppendStream(filePath: string): fs.WriteStream {
  return fs.createWriteStream(safeResolve(filePath), { flags: 'a' });
}
