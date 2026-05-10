#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join, dirname, resolve, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PULSE_ROOT = resolve(__dirname);

function findAllTsFiles(dir) {
  const files = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.name === 'node_modules' || e.name === 'lib' || e.name === '__parts__' ||
          e.name === '__kernel_additions__' || e.name.startsWith('migrate-') || 
          e.name.startsWith('fix-import-') || e.name.startsWith('_eliminate-')) continue;
      if (e.isDirectory()) {
        files.push(...findAllTsFiles(full));
      } else if (e.endsWith('.ts') || e.endsWith('.tsx')) {
        files.push(full);
      }
    }
  } catch (_) {}
  return files;
}

function resolveImport(fromFile, importPath) {
  if (!importPath.startsWith('.')) return null;
  const dir = dirname(fromFile);
  const unresolved = resolve(dir, importPath);
  const candidates = [
    unresolved + '.ts',
    unresolved + '.tsx',
    unresolved + '.d.ts',
    join(unresolved, 'index.ts'),
    join(unresolved, 'index.tsx'),
    join(unresolved, 'index.d.ts'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

const allFiles = findAllTsFiles(PULSE_ROOT);
console.log(`Scanning ${allFiles.length} TS files for broken imports...`);

let fixedFiles = 0;
let fixedImports = 0;

for (const file of allFiles) {
  let content = readFileSync(file, 'utf-8');
  if (!content.includes("from '")) continue;
  
  let changed = false;
  
  // Match all import/export from strings (both single and double quotes)
  const re = /((?:import|export)\b[^"'\n]*?from\s+['"])([^'"]+)('[^'"\n;]*;?)/g;
  let match;
  const newContent = content.replace(re, (full, prefix, importPath, suffix) => {
    if (importPath.includes('__parts__')) return full; // shouldn't exist but safety
    
    const resolved = resolveImport(file, importPath);
    if (resolved) return full; // OK
    
    // Try reducing ../
    if (importPath.startsWith('../')) {
      const reduced = importPath.replace(/^\.\.\//, '');
      const reducedResolved = resolveImport(file, reduced);
      if (reducedResolved) {
        fixedImports++;
        changed = true;
        return `${prefix}${reduced}${suffix}`;
      }
    }
    
    // Try adding ../ (for files that might need more depth)
    if (importPath.startsWith('./')) {
      const increased = importPath.replace(/^\.\//, '../');
      const increasedResolved = resolveImport(file, increased);
      if (increasedResolved) {
        fixedImports++;
        changed = true;
        return `${prefix}${increased}${suffix}`;
      }
    }
    
    return full;
  });
  
  if (changed) {
    writeFileSync(file, newContent, 'utf-8');
    fixedFiles++;
  }
}

console.log(`Fixed ${fixedImports} imports across ${fixedFiles} files`);
