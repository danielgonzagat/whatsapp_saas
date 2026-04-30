import {
  appendFileSync as nodeAppendFileSync,
  copyFileSync as nodeCopyFileSync,
  cpSync as nodeCpSync,
  createWriteStream as nodeCreateWriteStream,
  existsSync as nodeExistsSync,
  mkdirSync as nodeMkdirSync,
  readFileSync as nodeReadFileSync,
  readdirSync as nodeReaddirSync,
  renameSync as nodeRenameSync,
  rmSync as nodeRmSync,
  statSync as nodeStatSync,
  symlinkSync as nodeSymlinkSync,
  unlinkSync as nodeUnlinkSync,
  writeFileSync as nodeWriteFileSync,
  type CopySyncOptions,
  type Dirent,
  type MakeDirectoryOptions,
  type RmOptions,
  type Stats,
  type WriteStream,
} from 'fs';
import * as path from 'path';
import { resolveRoot } from './lib/safe-path';

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
const REPO_ROOT = resolveRoot(`${__dirname}${path.sep}..${path.sep}..`);
const TMP_ROOT = resolveRoot(require('os').tmpdir());
const HOME_ROOT = resolveRoot(require('os').homedir());
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
  const resolved = resolveRoot(filePath);
  for (const root of ALLOWED_ROOTS) {
    if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) {
      return resolved;
    }
  }
  throw new PathOutsideAllowedRootError(resolved);
}

/** Path exists. */
export function pathExists(filePath: string): boolean {
  return nodeExistsSync(safeResolve(filePath));
}

/** Stat path. */
export function statPath(filePath: string): Stats {
  return nodeStatSync(safeResolve(filePath));
}

/** Is directory. */
export function isDirectory(filePath: string): boolean {
  return statPath(filePath).isDirectory();
}

/** Read text file. */
export function readTextFile(filePath: string, encoding: BufferEncoding = 'utf8'): string {
  return nodeReadFileSync(safeResolve(filePath), encoding);
}

/** Read json file. */
export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readTextFile(filePath)) as T;
}

/** Read dir. */
export function readDir(filePath: string): string[];
/** Read dir. */
export function readDir(filePath: string, options: { withFileTypes: true }): Dirent[];
/** Read dir. */
export function readDir(filePath: string, options: { recursive: true }): string[];
/** Read dir. */
export function readDir(filePath: string, options?: unknown): unknown[] {
  try {
    return nodeReaddirSync(safeResolve(filePath), options as never) as unknown[];
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error?.code === 'ENOENT') return [];
    throw err;
  }
}

/** Ensure dir. */
export function ensureDir(filePath: string, options?: MakeDirectoryOptions): void {
  nodeMkdirSync(safeResolve(filePath), options);
}

/** Write file (text or binary). */
export function writeFile(filePath: string, content: string | Buffer | Uint8Array): void {
  nodeWriteFileSync(safeResolve(filePath), content);
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
export function removePath(filePath: string, options?: RmOptions): void {
  nodeRmSync(safeResolve(filePath), options);
}

/** Remove file. */
export function removeFile(filePath: string): void {
  nodeUnlinkSync(safeResolve(filePath));
}

/** Copy file. */
export function copyFile(sourcePath: string, targetPath: string): void {
  nodeCopyFileSync(safeResolve(sourcePath), safeResolve(targetPath));
}

/** Rename path. */
export function renamePath(sourcePath: string, targetPath: string): void {
  nodeRenameSync(safeResolve(sourcePath), safeResolve(targetPath));
}

/** Copy path. */
export function copyPath(sourcePath: string, targetPath: string, options?: CopySyncOptions): void {
  nodeCpSync(safeResolve(sourcePath), safeResolve(targetPath), options);
}

/** Symlink dir. */
export function symlinkDir(sourcePath: string, targetPath: string): void {
  nodeSymlinkSync(safeResolve(sourcePath), safeResolve(targetPath), 'dir');
}

/** Create append stream. */
export function createAppendStream(filePath: string): WriteStream {
  ensureDir(path.dirname(filePath), { recursive: true });
  return nodeCreateWriteStream(safeResolve(filePath), { flags: 'a' });
}

/** Append text to file (synchronous). */
export function appendTextFile(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath), { recursive: true });
  nodeAppendFileSync(safeResolve(filePath), content, 'utf8');
}
