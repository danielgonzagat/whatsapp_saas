import * as fs from 'fs';

export function pathExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function statPath(filePath: string): fs.Stats {
  return fs.statSync(filePath);
}

export function isDirectory(filePath: string): boolean {
  return statPath(filePath).isDirectory();
}

export function readTextFile(filePath: string, encoding: BufferEncoding = 'utf8'): string {
  return fs.readFileSync(filePath, encoding);
}

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readTextFile(filePath)) as T;
}

export function readDir(filePath: string): string[];
export function readDir(filePath: string, options: { withFileTypes: true }): fs.Dirent[];
export function readDir(filePath: string, options: { recursive: true }): string[];
export function readDir(filePath: string, options?: unknown): unknown[] {
  return fs.readdirSync(filePath, options as never) as unknown[];
}

export function ensureDir(filePath: string, options?: fs.MakeDirectoryOptions): void {
  fs.mkdirSync(filePath, options);
}

export function writeTextFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content);
}

export function writeBinaryFile(filePath: string, content: Buffer | Uint8Array): void {
  fs.writeFileSync(filePath, content);
}

export function removePath(filePath: string, options?: fs.RmOptions): void {
  fs.rmSync(filePath, options);
}

export function removeFile(filePath: string): void {
  fs.unlinkSync(filePath);
}

export function copyFile(sourcePath: string, targetPath: string): void {
  fs.copyFileSync(sourcePath, targetPath);
}

export function renamePath(sourcePath: string, targetPath: string): void {
  fs.renameSync(sourcePath, targetPath);
}

export function copyPath(
  sourcePath: string,
  targetPath: string,
  options?: fs.CopySyncOptions,
): void {
  fs.cpSync(sourcePath, targetPath, options);
}

export function symlinkDir(sourcePath: string, targetPath: string): void {
  fs.symlinkSync(sourcePath, targetPath, 'dir');
}

export function createAppendStream(filePath: string): fs.WriteStream {
  return fs.createWriteStream(filePath, { flags: 'a' });
}
