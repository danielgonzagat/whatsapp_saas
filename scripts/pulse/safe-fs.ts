import * as fs from 'fs';

const {
  copyFileSync,
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} = fs;

export function pathExists(resolvedPath: string): boolean {
  return existsSync(resolvedPath);
}

export function statPath(resolvedPath: string): fs.Stats {
  return statSync(resolvedPath);
}

export function isDirectory(resolvedPath: string): boolean {
  return statPath(resolvedPath).isDirectory();
}

export function readTextFile(resolvedPath: string, encoding: BufferEncoding = 'utf8'): string {
  return readFileSync(resolvedPath, encoding);
}

export function readJsonFile<T>(resolvedPath: string): T {
  return JSON.parse(readTextFile(resolvedPath)) as T;
}

export function readDir(resolvedPath: string): string[];
export function readDir(resolvedPath: string, options: { withFileTypes: true }): fs.Dirent[];
export function readDir(resolvedPath: string, options: { recursive: true }): string[];
export function readDir(resolvedPath: string, options?: unknown): unknown[] {
  return readdirSync(resolvedPath, options as never) as unknown[];
}

export function ensureDir(resolvedPath: string, options?: fs.MakeDirectoryOptions): void {
  mkdirSync(resolvedPath, options);
}

export function writeTextFile(resolvedPath: string, content: string): void {
  writeFileSync(resolvedPath, content);
}

export function writeBinaryFile(resolvedPath: string, content: Buffer | Uint8Array): void {
  writeFileSync(resolvedPath, content);
}

export function removePath(resolvedPath: string, options?: fs.RmOptions): void {
  rmSync(resolvedPath, options);
}

export function removeFile(resolvedPath: string): void {
  unlinkSync(resolvedPath);
}

export function copyFile(sourcePath: string, targetPath: string): void {
  copyFileSync(sourcePath, targetPath);
}

export function renamePath(sourcePath: string, targetPath: string): void {
  renameSync(sourcePath, targetPath);
}

export function copyPath(
  sourcePath: string,
  targetPath: string,
  options?: fs.CopySyncOptions,
): void {
  cpSync(sourcePath, targetPath, options);
}

export function symlinkDir(sourcePath: string, targetPath: string): void {
  symlinkSync(sourcePath, targetPath, 'dir');
}

export function createAppendStream(resolvedPath: string): fs.WriteStream {
  return createWriteStream(resolvedPath, { flags: 'a' });
}
