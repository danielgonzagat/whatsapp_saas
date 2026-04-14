#!/usr/bin/env node
/**
 * scripts/ops/codemods/remove-prisma-dynamic.mjs
 *
 * Phase 2C of the Codacy convergence plan.
 *
 * Removes the PrismaDynamic type alias and rewrites prismaAny.X calls to
 * prisma.X across the backend. Uses per-file validation: transforms one
 * file at a time, runs typecheck, reverts the file via git restore if
 * typecheck fails, logs the skip.
 *
 * Sensitive paths (checkout/, billing/, auth/, wallet*, webhooks/,
 * partnerships/, affiliate/, prisma/) are SKIPPED — they need PR review
 * via Phase 3 Ralph.
 *
 * Caller responsibility: after the codemod finishes the success set,
 * run npm --prefix backend test before commit. The codemod's own gate
 * is typecheck only (test suites take 30+ seconds per file and are
 * better run in batch at the end).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const failuresLogPath = path.join(repoRoot, 'scripts/ops/codemods/.prisma-dynamic-failures.json');
const successLogPath = path.join(repoRoot, 'scripts/ops/codemods/.prisma-dynamic-success.json');

const SENSITIVE_PATH_PREFIXES = [
  'backend/src/auth/',
  'backend/src/billing/',
  'backend/src/checkout/',
  'backend/src/partnerships/',
  'backend/src/affiliate/',
  'backend/src/webhooks/',
  'backend/src/kloel/wallet',
  'backend/prisma/',
];

function isSensitive(relPath) {
  return SENSITIVE_PATH_PREFIXES.some((p) => relPath.startsWith(p));
}

function ensureTsMorphInstalled() {
  const probe = path.join(repoRoot, 'node_modules/ts-morph/package.json');
  if (!existsSync(probe)) {
    console.error(
      '[remove-prisma-dynamic] ts-morph not installed. Run: npm install --save-dev ts-morph',
    );
    process.exit(2);
  }
}

function runBackendTypecheck() {
  try {
    execFileSync('npm', ['--prefix', 'backend', 'run', 'typecheck'], {
      cwd: repoRoot,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return { ok: true };
  } catch (err) {
    const stderr = (err.stderr || '').toString();
    const stdout = (err.stdout || '').toString();
    return { ok: false, output: (stdout + '\n' + stderr).slice(0, 2000) };
  }
}

function gitRestoreFile(absPath) {
  try {
    execFileSync('git', ['restore', absPath], { cwd: repoRoot, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  ensureTsMorphInstalled();
  const { Project, SyntaxKind } = await import('ts-morph');

  // Find all files that contain prismaAny
  const grepOut = execFileSync('git', ['grep', '-l', 'prismaAny', '--', 'backend/src/'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();

  const candidateFiles = grepOut
    .split('\n')
    .filter(Boolean)
    .filter((p) => !p.endsWith('.spec.ts') && !p.includes('__tests__'));

  console.log(
    `[remove-prisma-dynamic] Found ${candidateFiles.length} candidate files (excluding tests)`,
  );

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
  });

  const successes = [];
  const failures = [];
  const skippedSensitive = [];

  for (const relPath of candidateFiles) {
    if (isSensitive(relPath)) {
      skippedSensitive.push(relPath);
      console.log(`[remove-prisma-dynamic] SENSITIVE skip: ${relPath}`);
      continue;
    }

    const absPath = path.join(repoRoot, relPath);
    console.log(`[remove-prisma-dynamic] processing ${relPath}`);

    let sourceFile;
    try {
      sourceFile = project.addSourceFileAtPath(absPath);
    } catch (err) {
      failures.push({ file: relPath, reason: `addSourceFile: ${err.message}` });
      continue;
    }

    let mutationCount = 0;

    // 1. Find and delete `type PrismaDynamic = ...` alias
    const typeAliases = sourceFile.getTypeAliases();
    for (const alias of typeAliases) {
      if (alias.getName() === 'PrismaDynamic') {
        alias.remove();
        mutationCount++;
      }
    }

    // 2. Find `prismaAny: PrismaDynamic` parameter declarations and remove
    //    the type annotation (let type inference work via `prisma`)
    const parameters = sourceFile.getDescendantsOfKind(SyntaxKind.Parameter);
    for (const param of parameters) {
      if (param.getName() === 'prismaAny') {
        const typeNode = param.getTypeNode();
        if (typeNode && typeNode.getText() === 'PrismaDynamic') {
          param.removeType();
          mutationCount++;
        }
      }
    }

    // 3. Find `private readonly prismaAny: PrismaDynamic` class properties
    //    and rewrite as direct prisma reference
    const propertyDecls = sourceFile.getDescendantsOfKind(SyntaxKind.PropertyDeclaration);
    for (const prop of propertyDecls) {
      if (prop.getName() === 'prismaAny') {
        const typeNode = prop.getTypeNode();
        if (typeNode && typeNode.getText() === 'PrismaDynamic') {
          prop.removeType();
          mutationCount++;
        }
      }
    }

    // 4. Find `this.prismaAny.<X>` and rewrite to `this.prisma.<X>`
    const propAccesses = sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
    for (const access of propAccesses) {
      const expr = access.getExpression();
      const name = access.getName();
      if (name === 'prismaAny') {
        // expr is `this`, access full text is `this.prismaAny`
        access.replaceWithText(`${expr.getText()}.prisma`);
        mutationCount++;
      }
    }

    if (mutationCount === 0) {
      console.log(`[remove-prisma-dynamic]   no mutations needed`);
      project.removeSourceFile(sourceFile);
      continue;
    }

    try {
      sourceFile.saveSync();
    } catch (err) {
      failures.push({ file: relPath, mutations: mutationCount, reason: `save: ${err.message}` });
      project.removeSourceFile(sourceFile);
      continue;
    }

    project.removeSourceFile(sourceFile);

    // Per-file typecheck gate
    console.log(`[remove-prisma-dynamic]   ${mutationCount} mutations, running typecheck...`);
    const checkResult = runBackendTypecheck();
    if (!checkResult.ok) {
      console.log(`[remove-prisma-dynamic]   typecheck FAILED, reverting`);
      gitRestoreFile(absPath);
      failures.push({
        file: relPath,
        mutations: mutationCount,
        reason: 'typecheck failed after transform',
        excerpt: checkResult.output.slice(0, 400),
      });
    } else {
      console.log(`[remove-prisma-dynamic]   typecheck OK`);
      successes.push({ file: relPath, mutations: mutationCount });
    }
  }

  writeFileSync(failuresLogPath, JSON.stringify(failures, null, 2));
  writeFileSync(successLogPath, JSON.stringify({ successes, skippedSensitive }, null, 2));

  console.log();
  console.log(`[remove-prisma-dynamic] DONE.`);
  console.log(
    `  successes: ${successes.length} (${successes.reduce((a, s) => a + s.mutations, 0)} mutations)`,
  );
  console.log(`  failures:  ${failures.length}`);
  console.log(`  sensitive skipped: ${skippedSensitive.length}`);
}

main().catch((err) => {
  console.error('[remove-prisma-dynamic] FATAL:', err);
  process.exit(1);
});
