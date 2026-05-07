import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SOURCE_DIR, MIRROR_ROOT } from './constants.mjs';

export function findOrphans() {
  const sidecarSuffixes = ['.tier.json', '.phase.json', '.coverage.json', '.findings.json'];

  const mdSet = new Set();
  if (existsSync(SOURCE_DIR)) {
    const stack = [SOURCE_DIR];
    while (stack.length) {
      const dir = stack.pop();
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) {
          stack.push(full);
        } else if (e.isFile() && e.name.endsWith('.md')) {
          mdSet.add(full);
        }
      }
    }
  }

  const orphans = [];
  if (existsSync(SOURCE_DIR)) {
    const stack = [SOURCE_DIR];
    while (stack.length) {
      const dir = stack.pop();
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) {
          stack.push(full);
        } else if (e.isFile()) {
          for (const suffix of sidecarSuffixes) {
            if (e.name.endsWith(suffix)) {
              const mdPath = full.slice(0, -suffix.length) + '.md';
              if (!mdSet.has(mdPath)) {
                orphans.push(full);
              }
              break;
            }
          }
        }
      }
    }
  }

  return orphans;
}

export function fixOrphans(dry) {
  const orphans = findOrphans();
  console.error(`found ${orphans.length} orphan sidecars`);
  if (!dry) {
    let removed = 0;
    for (const path of orphans) {
      try {
        unlinkSync(path);
        removed++;
      } catch {
        // ignore permission errors
      }
    }
    console.error(`removed ${removed} orphans`);
  } else {
    console.error('[dry mode] would remove these:');
    for (const p of orphans.slice(0, 20)) {
      console.error(`  ${relative(MIRROR_ROOT, p)}`);
    }
    if (orphans.length > 20) {
      console.error(`  ... and ${orphans.length - 20} more`);
    }
  }
  return orphans.length;
}
