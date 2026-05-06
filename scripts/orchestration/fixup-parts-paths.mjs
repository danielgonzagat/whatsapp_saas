#!/usr/bin/env node
/**
 * Fixup broken relative imports in `__parts__/` files created by the
 * decomposition fleet.
 *
 * Files in `<basename>/__parts__/` are 2 directory levels below the
 * original (e.g. `scripts/pulse/foo/__parts__/x.ts` is 2 levels under
 * `scripts/pulse/`). When subagents wrote `import ... from '../types'`
 * they meant the original-file context (1 level up from `scripts/pulse/foo.ts`),
 * but at the actual `__parts__/x.ts` location `../` resolves to
 * `scripts/pulse/foo/`, not `scripts/pulse/`.
 *
 * Heuristic: for any file under `**\/__parts__/`, rewrite `from '../X'`
 * to `from '../../X'` IF a sibling `from './<base>'` style would not
 * collide. We check whether `scripts/pulse/foo/X.ts` exists first; if it
 * does (intra-decomposition import), leave it. If not, and
 * `scripts/pulse/X.ts` exists, rewrite to `../../X`.
 *
 * For `<basename>/__parts__/<sub>/__parts__/x.ts` (3 levels), rewrite
 * `'../../X'` to `'../../../X'` similarly.
 *
 * Usage: node fixup-parts-paths.mjs [--dry-run] [--worktree=path]
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const WORKTREE_ARG = argv.find((a) => a.startsWith('--worktree='));
const WORKTREE = WORKTREE_ARG
  ? WORKTREE_ARG.split('=')[1]
  : '/Users/danielpenin/whatsapp_saas-pr198';

function findPartsFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur);
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(cur, e);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (e === 'node_modules' || e === '.git' || e === 'dist' || e === '.next') continue;
        stack.push(full);
      } else if (st.isFile() && /\.(ts|tsx|mjs)$/.test(e) && full.includes('/__parts__/')) {
        out.push(full);
      }
    }
  }
  return out;
}

// Each import line `from 'X'` where X is relative — rewrite if the resolved
// path doesn't exist but an extra `../` does.
function fixImports(content, fileAbs, worktreeRoot) {
  const fileDir = dirname(fileAbs);
  let modified = content;
  let changed = 0;

  const reImport = /(from|import)\s*\(?\s*['"](\.\/[^'"]*|\.\.\/[^'"]*)['"]/g;
  modified = modified.replace(reImport, (match, kw, importPath) => {
    // resolve against fileDir
    const candidates = [
      importPath + '.ts',
      importPath + '.tsx',
      importPath + '.mjs',
      importPath + '/index.ts',
      importPath + '/index.tsx',
    ];
    const exists = candidates.some((c) => existsSync(resolve(fileDir, c)));
    if (exists) return match;

    // try adding one more ../
    const lifted = importPath.startsWith('../') ? '../' + importPath : importPath;
    if (importPath.startsWith('../')) {
      const liftedCandidates = [
        lifted + '.ts',
        lifted + '.tsx',
        lifted + '.mjs',
        lifted + '/index.ts',
        lifted + '/index.tsx',
      ];
      const liftedExists = liftedCandidates.some((c) => existsSync(resolve(fileDir, c)));
      if (liftedExists) {
        changed++;
        return match.replace(importPath, lifted);
      }
    }
    return match;
  });

  return { content: modified, changed };
}

const allFiles = [];
for (const top of ['scripts/pulse', 'scripts/orchestration']) {
  const fullTop = join(WORKTREE, top);
  allFiles.push(...findPartsFiles(fullTop));
}

console.log(`scanning ${allFiles.length} __parts__/ files`);

let totalChanged = 0;
let filesWritten = 0;

for (const abs of allFiles) {
  const orig = readFileSync(abs, 'utf8');
  const { content, changed } = fixImports(orig, abs, WORKTREE);
  if (changed > 0) {
    totalChanged += changed;
    const rel = abs.replace(WORKTREE + '/', '');
    if (DRY) {
      console.log(`WOULD FIX (${changed}): ${rel}`);
    } else {
      writeFileSync(abs, content);
      console.log(`FIXED (${changed}): ${rel}`);
      filesWritten++;
    }
  }
}

console.log(
  `\nSummary: filesScanned=${allFiles.length} filesWritten=${filesWritten} totalImportsRewritten=${totalChanged}`,
);
