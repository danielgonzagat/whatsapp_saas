import fs from 'fs';
import path from 'path';

export interface PlaceholderTestResult {
  count: number;
  files: string[];
}

export interface WeakAssertionResult {
  count: number;
  files: string[];
}

export interface TypeEscapeHatchResult {
  count: number;
  locations: string[];
}

export function detectPlaceholderTests(rootDir: string): PlaceholderTestResult {
  const files: string[] = [];
  const specPattern = /\.(spec|test)\.(ts|tsx)$/;
  const placeholderPatterns = [
    /it\(\s*["'`]TODO/,
    /it\(\s*["'`]should\b.*\bnot be empty["'`]\)/,
    /test\(\s*["'`]TODO/,
    /test\(\s*["'`]placeholder/,
    /it\.(todo|skip)\(\s*["'`]/,
    /test\.(todo|skip)\(\s*["'`]/,
    /describe\.(todo|skip)\(\s*["'`]/,
    /expect\(\s*true\s*\)\.toBe\(\s*true\s*\)/,
    /expect\(\s*1\s*\)\.toBe\(\s*1\s*\)/,
    /it\(\s*["'`]should work["'`]\)/,
    /test\(\s*["'`]should work["'`]\)/,
    /it\(\s*["'`]should pass["'`]\)/,
    /test\(\s*["'`]should pass["'`]\)/,
    /it\(\s*["'`]\s*["'`]\)/,
    /test\(\s*["'`]\s*["'`]\)/,
  ];

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        scanDir(fullPath);
      } else if (entry.isFile() && specPattern.test(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        for (const pattern of placeholderPatterns) {
          if (pattern.test(content)) {
            files.push(fullPath.replace(rootDir + path.sep, ''));
            break;
          }
        }
      }
    }
  }

  scanDir(rootDir);
  return { count: files.length, files };
}

export function detectWeakStatusAssertions(rootDir: string): WeakAssertionResult {
  const files: string[] = [];
  const specPattern = /\.(spec|test)\.(ts|tsx)$/;
  const weakPatterns = [
    /expect\(\s*response\.(status|statusCode)\s*\)\.toBeDefined\(\)/,
    /expect\(\s*response\s*\)\.toBeDefined\(\)/,
    /expect\(\s*result\s*\)\.toBeDefined\(\)/,
    /expect\(\s*res\s*\)\.toBeTruthy\(\)/,
    /expect\(\s*data\s*\)\.toBeTruthy\(\)/,
    /expect\(\s*.*\.status\s*\)\s*\.toBe\(\s*\d{3}\s*\).*\n\s*\.toBeDefined/,
  ];

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        scanDir(fullPath);
      } else if (entry.isFile() && specPattern.test(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        for (const pattern of weakPatterns) {
          if (pattern.test(content)) {
            files.push(fullPath.replace(rootDir + path.sep, ''));
            break;
          }
        }
      }
    }
  }

  scanDir(rootDir);
  return { count: files.length, files };
}

export function detectTypeEscapeHatches(rootDir: string): TypeEscapeHatchResult {
  const locations: string[] = [];
  const filePattern = /\.(ts|tsx)$/;
  const specFilePattern = /\.(spec|test)\.(ts|tsx)$/;
  const excludeDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next']);
  const escapePatterns = [
    { pattern: /as\s+any\b/, label: 'as any' },
    { pattern: /@ts-ignore/, label: '@ts-ignore' },
    { pattern: /@ts-expect-error/, label: '@ts-expect-error' },
    {
      pattern: /\/\/\s*eslint-disable\s+@typescript-eslint\/no-explicit-any/,
      label: 'eslint-disable no-explicit-any',
    },
    {
      pattern: /\/\/\s*eslint-disable-next-line\s+@typescript-eslint\/no-explicit-any/,
      label: 'eslint-disable-next-line no-explicit-any',
    },
  ];

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && !excludeDirs.has(entry.name)) {
        scanDir(fullPath);
      } else if (entry.isFile() && filePattern.test(entry.name)) {
        const relativePath = fullPath.replace(rootDir + path.sep, '');
        if (
          specFilePattern.test(entry.name) ||
          relativePath.endsWith('.spec.ts') ||
          relativePath.endsWith('.test.ts')
        )
          continue;
        const content = fs.readFileSync(fullPath, 'utf-8');
        for (let i = 0; i < lines.length; i++) {
          for (const ep of escapePatterns) {
            if (ep.pattern.test(lines[i])) {
              locations.push(`${relativePath}:${i + 1} (${ep.label})`);
            }
          }
        }
      }
    }
  }

  scanDir(rootDir);
  return { count: locations.length, locations };
}
