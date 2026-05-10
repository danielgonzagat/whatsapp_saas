/**
 * One-shot script: eliminates __parts__ directories in scripts/pulse.
 * Phase 1: Leaf modules (parent only has __parts__/)
 * Phase 2: Root __parts__ sub-modules
 * Phase 3: Nested scenario-engine
 * Run: npx ts-node --project scripts/pulse/tsconfig.json scripts/pulse/_eliminate-parts.ts
 */
import { readdirSync, renameSync, rmdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, relative, resolve } from 'path';

const PULSE_ROOT = resolve(__dirname);

function findAllPartsDirs(root: string): string[] {
  const results: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = join(dir, entry.name);
      if (entry.name === '__parts__') {
        results.push(full);
      } else {
        walk(full);
      }
    }
  }
  walk(root);
  return results;
}

function isLeafModule(partsDir: string): boolean {
  // parent has only __parts__/ and no other .ts files
  const parent = dirname(partsDir);
  const entries = readdirSync(parent, { withFileTypes: true });
  const tsFiles = entries.filter(
    (e) => e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.tsx'))
  );
  return tsFiles.length === 0;
}

function isPulseRootParts(partsDir: string): boolean {
  return partsDir === join(PULSE_ROOT, '__parts__');
}

// Collect all .ts/.tsx files in a directory recursively
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__parts__' && !entry.name.startsWith('_eliminate')) {
          walk(full);
        }
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

function replaceInFile(filePath: string, replacements: Array<[RegExp, string]>): boolean {
  let content = readFileSync(filePath, 'utf-8');
  let changed = false;
  for (const [pattern, replacement] of replacements) {
    const newContent = content.replace(pattern, replacement);
    if (newContent !== content) {
      content = newContent;
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(filePath, content, 'utf-8');
  }
  return changed;
}

// Phase 1: Eliminate leaf __parts__ modules (move files up, update imports, delete)
function phase1LeafModules() {
  const allParts = findAllPartsDirs(PULSE_ROOT);
  const leafParts = allParts.filter((p) => isLeafModule(p) && !isPulseRootParts(p));

  console.log(`\n=== Phase 1: ${leafParts.length} leaf __parts__ modules ===`);

  const movedModules: string[] = [];

  for (const partsDir of leafParts) {
    const parent = dirname(partsDir);
    const relParent = relative(PULSE_ROOT, parent);
    const moduleName = relParent || '.';

    // Move all files from __parts__/ to parent/
    const files = readdirSync(partsDir).filter(
      (f) => f.endsWith('.ts') || f.endsWith('.tsx') || statSync(join(partsDir, f)).isDirectory()
    );

    for (const file of files) {
      const src = join(partsDir, file);
      const dest = join(parent, file);
      if (statSync(src).isFile()) {
        renameSync(src, dest);
      } else {
        // sub-directory within __parts__ - handle recursively
        moveDirectoryRecursive(src, dest);
      }
    }

    // Remove now-empty __parts__ directory
    try {
      rmdirSync(partsDir);
    } catch {
      // might have subdirs still
    }

    movedModules.push(moduleName);
  }

  // Now update ALL imports in scripts/pulse to remove __parts__ from paths
  console.log('Updating imports...');
  const allTsFiles = collectTsFiles(PULSE_ROOT);
  let totalChanges = 0;

  for (const filePath of allTsFiles) {
    // Pattern: module-name/__parts__/ → module-name/
    // This handles: './module/__parts__/file', '../module/__parts__/file', '../../module/__parts__/file', etc.
    const replacements: Array<[RegExp, string]> = [
      // Cross-module imports pointing to __parts__
      [/(['"])([^'"]*)\/__parts__\/([^'"]+)(['"])/g, '$1$2/$3$4'],
    ];

    if (replaceInFile(filePath, replacements)) {
      totalChanges++;
    }
  }

  console.log(`  Changed ${totalChanges} files`);
  console.log(`  Moved modules: ${movedModules.join(', ')}`);
}

function moveDirectoryRecursive(src: string, dest: string) {
  if (!statSync(src).isDirectory()) {
    renameSync(src, dest);
    return;
  }
  // Create dest if needed
  const { mkdirSync } = require('fs');
  if (!require('fs').existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      moveDirectoryRecursive(srcPath, destPath);
    } else {
      renameSync(srcPath, destPath);
    }
  }
  rmdirSync(src);
}

// Phase 2: Root __parts__ - move sub-modules to regular directories
function phase2RootParts() {
  const rootParts = join(PULSE_ROOT, '__parts__');
  if (!require('fs').existsSync(rootParts)) {
    console.log('\n=== Phase 2: Root __parts__ already gone ===');
    return;
  }

  console.log('\n=== Phase 2: Root __parts__ sub-modules ===');

  // Name collisions with existing .ts files at pulse root
  const collisionMap: Record<string, string> = {
    artifacts: 'artifacts-gen',
    'convergence-plan': 'convergence-plan-core',
    'dod-engine': 'dod-engine-core',
  };

  const subModules = readdirSync(rootParts, { withFileTypes: true })
    .filter((e) => e.isDirectory());

  for (const sub of subModules) {
    const srcDir = join(rootParts, sub.name);
    const destName = collisionMap[sub.name] || sub.name;
    const destDir = join(PULSE_ROOT, destName);

    console.log(`  Moving ${sub.name} → ${destName}`);

    // Move all files recursively
    moveDirectoryRecursive(srcDir, destDir);
  }

  // Update imports: ./__parts__/submodule/ → ./renamed-submodule/  or  ./submodule/
  console.log('Updating imports for root __parts__...');
  const allTsFiles = collectTsFiles(PULSE_ROOT);
  let totalChanges = 0;

  for (const filePath of allTsFiles) {
    const replacements: Array<[RegExp, string]> = [
      // Exact paths from root to __parts__ submodules (with renamed ones)
      // This is complex - we need to handle each submodule specifically
      // Generic pattern: remove __parts__/ from the path
      [/(['"])(\.{0,2}\/)(__parts__\/)([^'"]+)(['"])/g, (_m, q, prefix, _parts, rest, end) => {
        // Check if rest starts with a renamed module
        for (const [old, renamed] of Object.entries(collisionMap)) {
          if (rest.startsWith(old + '/') || rest === old) {
            return `${q}${prefix}${renamed}/${rest.slice(old.length + 1)}${end}`;
          }
        }
        return `${q}${prefix}${rest}${end}`;
      }],
    ];

    if (replaceInFile(filePath, replacements)) {
      totalChanges++;
    }
  }

  // Also do global cleanup for any remaining __parts__ in paths
  for (const filePath of allTsFiles) {
    if (replaceInFile(filePath, [[/(['"])([^'"]*)\/__parts__\/([^'"]+)(['"])/g, '$1$2/$3$4']])) {
      totalChanges++;
    }
  }

  // Remove empty root __parts__
  try {
    rmdirSync(rootParts);
    console.log('  Deleted scripts/pulse/__parts__');
  } catch (e) {
    console.log('  Could not delete root __parts__ (may have remaining files):', String(e));
  }

  console.log(`  Changed ${totalChanges} files`);
}

// Main
console.log('Starting __parts__ elimination...');

// First handle nested ones (scenario-engine sub-__parts__) by moving them up
const nestedBuilder = join(PULSE_ROOT, 'scenario-engine/__parts__/builder/__parts__');
const nestedPlaywright = join(PULSE_ROOT, 'scenario-engine/__parts__/playwright/__parts__');

if (require('fs').existsSync(nestedBuilder)) {
  console.log('\nPre-pass: handling nested scenario-engine/builder/__parts__');
  moveDirectoryRecursive(nestedBuilder, join(PULSE_ROOT, 'scenario-engine/__parts__/builder'));
}
if (require('fs').existsSync(nestedPlaywright)) {
  console.log('Pre-pass: handling nested scenario-engine/playwright/__parts__');
  moveDirectoryRecursive(nestedPlaywright, join(PULSE_ROOT, 'scenario-engine/__parts__/playwright'));
}

phase1LeafModules();
phase2RootParts();

// Final global pass to clean up any remaining __parts__/ in import paths
console.log('\n=== Final cleanup pass ===');
const allTsFiles = collectTsFiles(PULSE_ROOT);
let cleanupCount = 0;
for (const filePath of allTsFiles) {
  if (replaceInFile(filePath, [[/(['"])([^'"]*)\/__parts__\/([^'"]+)(['"])/g, '$1$2/$3$4']])) {
    cleanupCount++;
  }
}
console.log(`  Final cleanup: ${cleanupCount} files`);

console.log('\nDone. Run validation to verify.');
