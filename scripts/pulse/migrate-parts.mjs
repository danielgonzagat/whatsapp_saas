#!/usr/bin/env node
import { readdirSync, renameSync, mkdirSync, rmdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join, dirname, resolve, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PULSE_ROOT = resolve(__dirname);

const MOVED = [];
const DIRS_REMOVED = [];
const IMPORT_UPDATED = [];

function findAllFilesUnder(dir) {
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...findAllFilesUnder(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function findAllPartsDirs(root) {
  const found = [];
  try {
    const entries = readdirSync(root, { withFileTypes: true });
    for (const e of entries) {
      const full = join(root, e.name);
      if (e.isDirectory()) {
        if (e.name === '__parts__') {
          found.push(full);
        } else {
          found.push(...findAllPartsDirs(full));
        }
      }
    }
  } catch (_) { /* ignore */ }
  return found;
}

// ── Safety check: do not touch locked auditor ──────────────────────
const LOCKED_AUDITOR = resolve(PULSE_ROOT, 'no-hardcoded-reality-audit.ts');
if (existsSync(LOCKED_AUDITOR)) {
  const content = readFileSync(LOCKED_AUDITOR, 'utf-8');
  if (content.includes('__parts__')) {
    console.error('ERROR: Locked auditor references __parts__. Manual intervention required.');
    process.exit(1);
  }
}

// ── Phase 1: Collect all files under __parts__ dirs ──────────────────

const partsDirs = findAllPartsDirs(PULSE_ROOT);
console.log(`Found ${partsDirs.length} __parts__ directories`);

// Deduplicate by finding all __parts__ dirs, deepest first
partsDirs.sort((a, b) => b.split('/').length - a.split('/').length);

const partsFiles = [];
for (const partsDir of partsDirs) {
  const files = findAllFilesUnder(partsDir);
  for (const f of files) {
    if (f.endsWith('.ts') || f.endsWith('.tsx')) {
      partsFiles.push(f);
    }
  }
}

console.log(`Found ${partsFiles.length} files inside __parts__ directories`);

// ── Phase 2: Compute target paths ──────────────────────────────────

const moves = [];
for (const src of partsFiles) {
  const relativePath = relative(PULSE_ROOT, src);
  // Remove all /__parts__/ segments
  const targetRel = relativePath.replace(/\/__parts__\//g, '/');
  const dst = resolve(PULSE_ROOT, targetRel);
  moves.push({ src, dst, targetRel });
}

// Check for destination conflicts
const dstSet = new Set();
for (const { dst } of moves) {
  if (dstSet.has(dst)) {
    console.error(`ERROR: Duplicate destination: ${dst}`);
    process.exit(1);
  }
  dstSet.add(dst);
}

// ── Phase 3: Execute moves ─────────────────────────────────────────

console.log('\nMoving files...');
for (const { src, dst } of moves) {
  // Create parent dir
  const parent = dirname(dst);
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
    console.log(`  mkdir: ${relative(PULSE_ROOT, parent)}`);
  }
  
  // Check if destination already has a file (shouldn't happen if dedup passed)
  if (existsSync(dst)) {
    console.error(`  SKIP (exists): ${dst}`);
    continue;
  }
  
  renameSync(src, dst);
  MOVED.push({ src: relative(PULSE_ROOT, src), dst: relative(PULSE_ROOT, dst) });
}
console.log(`Moved ${MOVED.length} files`);

// ── Phase 4: Remove empty __parts__ dirs ────────────────────────────

// Re-scan and remove empties — deepest first (already sorted)
console.log('\nRemoving empty __parts__ directories...');
for (const partsDir of partsDirs) {
  try {
    const entries = readdirSync(partsDir);
    if (entries.length === 0) {
      rmdirSync(partsDir);
      DIRS_REMOVED.push(relative(PULSE_ROOT, partsDir));
    } else {
      // Check if only empty subdirs remain
      let hasOnlyEmptySubdirs = true;
      for (const entry of entries) {
        const fp = join(partsDir, entry);
        try {
          const st = statSync(fp);
          if (st.isDirectory()) {
            const sub = readdirSync(fp);
            if (sub.length > 0) {
              hasOnlyEmptySubdirs = false;
            } else {
              rmdirSync(fp);
            }
          } else {
            hasOnlyEmptySubdirs = false;
          }
        } catch { hasOnlyEmptySubdirs = false; }
      }
      if (hasOnlyEmptySubdirs) {
        // Re-check
        const recheck = readdirSync(partsDir);
        if (recheck.length === 0) {
          rmdirSync(partsDir);
          DIRS_REMOVED.push(relative(PULSE_ROOT, partsDir));
        }
      }
    }
  } catch (e) {
    console.log(`  Note: could not remove ${relative(PULSE_ROOT, partsDir)}: ${e.message}`);
  }
}
console.log(`Removed ${DIRS_REMOVED.length} __parts__ directories`);

// ── Phase 5: Update imports ─────────────────────────────────────────

console.log('\nUpdating import paths...');
const allTsFiles = findAllFilesUnder(PULSE_ROOT).filter(f => 
  (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('node_modules') && !f.includes('/lib/')
);

let modifiedCount = 0;
for (const file of allTsFiles) {
  const content = readFileSync(file, 'utf-8');
  if (!content.includes('__parts__')) continue;

  const lines = content.split('\n');
  let changed = false;
  
  const newLines = lines.map(line => {
    if (line.includes('__parts__') && /^\s*(import|export)\b/.test(line.trim())) {
      return line.replace(/\/__parts__\//g, '/');
    }
    return line;
  });

  if (newLines.some((l, i) => l !== lines[i])) {
    writeFileSync(file, newLines.join('\n'), 'utf-8');
    changed = true;
    modifiedCount++;
    IMPORT_UPDATED.push(relative(PULSE_ROOT, file));
  }
}

console.log(`Updated imports in ${modifiedCount} files`);

// ── Summary ─────────────────────────────────────────────────────────

console.log('\n========================================');
console.log('  MIGRATION COMPLETE');
console.log('========================================');
console.log(`  Files moved:    ${MOVED.length}`);
console.log(`  Dirs removed:   ${DIRS_REMOVED.length}`);
console.log(`  Imports fixed:  ${modifiedCount}`);
console.log('========================================');
console.log('\nDirs eliminated:');
DIRS_REMOVED.forEach(d => console.log(`  - ${d}`));
