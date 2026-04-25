import * as fs from 'fs';

/** Path exists. */
export function pathExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/** Stat path. */
export function statPath(filePath: string): fs.Stats {
  return fs.statSync(filePath);
}

/** Is directory. */
export function isDirectory(filePath: string): boolean {
  return statPath(filePath).isDirectory();
}

/** Read text file. */
export function readTextFile(filePath: string, encoding: BufferEncoding = 'utf8'): string {
  return fs.readFileSync(filePath, encoding);
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
  return fs.readdirSync(filePath, options as never) as unknown[];
}

/** Ensure dir. */
export function ensureDir(filePath: string, options?: fs.MakeDirectoryOptions): void {
  fs.mkdirSync(filePath, options);
}

/** Write file (text or binary). */
export function writeFile(filePath: string, content: string | Buffer | Uint8Array): void {
  fs.writeFileSync(filePath, content);
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
  fs.rmSync(filePath, options);
}

/** Remove file. */
export function removeFile(filePath: string): void {
  fs.unlinkSync(filePath);
}

/** Copy file. */
export function copyFile(sourcePath: string, targetPath: string): void {
  fs.copyFileSync(sourcePath, targetPath);
}

/** Rename path. */
export function renamePath(sourcePath: string, targetPath: string): void {
  fs.renameSync(sourcePath, targetPath);
}

/** Copy path. */
export function copyPath(
  sourcePath: string,
  targetPath: string,
  options?: fs.CopySyncOptions,
): void {
  fs.cpSync(sourcePath, targetPath, options);
}

/** Symlink dir. */
export function symlinkDir(sourcePath: string, targetPath: string): void {
  fs.symlinkSync(sourcePath, targetPath, 'dir');
}

/** Create append stream. */
export function createAppendStream(filePath: string): fs.WriteStream {
  return fs.createWriteStream(filePath, { flags: 'a' });
}
