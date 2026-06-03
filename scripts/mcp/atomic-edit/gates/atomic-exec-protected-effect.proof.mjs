#!/usr/bin/env node
/**
 * gates/atomic-exec-protected-effect.proof.mjs — proves rank-3 no-bypass: atomic_exec
 * governs the realized EFFECT, not the command string. `protectedWriteTarget` reads the
 * command and so misses an obfuscated write (`node -e fs.writeFileSync`, a runtime-built
 * path, a symlink). `protectedEffectHits` inspects the byte-effect the command ACTUALLY
 * produced, so any protected file it touched — by any means, any exit code — is caught and
 * the whole effect is reversed + refused in the handler.
 *
 * This proves the pure decision function directly (the handler wires it to rollbackEffect +
 * fail), so it needs no live MCP.
 */
import { pathToFileURL } from 'node:url';

const dist = '/Users/danielpenin/kloel/scripts/mcp/atomic-edit/dist';
const { protectedEffectHits } = await import(pathToFileURL(`${dist}/server-tools-exec.js`).href);
const { REPO_ROOT } = await import(pathToFileURL(`${dist}/guard.js`).href);

const hits = (rootAbs, files) =>
  protectedEffectHits(
    rootAbs,
    files.map((file) => ({ file })),
  );

const results = [];
const rec = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

// Protected files touched by the realized effect → caught.
rec('ai-models.ts caught', hits(REPO_ROOT, ['backend/src/lib/ai-models.ts']).length === 1);
rec('CLAUDE.md caught', hits(REPO_ROOT, ['CLAUDE.md']).length === 1);
rec('ci-cd.yml caught', hits(REPO_ROOT, ['.github/workflows/ci-cd.yml']).length === 1);
rec('eslint config caught', hits(REPO_ROOT, ['backend/eslint.config.mjs']).length === 1);
rec('.husky/pre-push caught', hits(REPO_ROOT, ['.husky/pre-push']).length === 1);
rec('ops json caught', hits(REPO_ROOT, ['ops/kloel-design-tokens.json']).length === 1);
rec('scripts/ops/check caught', hits(REPO_ROOT, ['scripts/ops/check-foo.mjs']).length === 1);

// Obfuscation-independent: the effect is on the REALIZED file regardless of how the command
// named it. rootAbs=<cwd> resolves a cwd-relative effect path back to repo-relative.
rec(
  'rootAbs subdir resolves to protected',
  hits(`${REPO_ROOT}/backend`, ['src/lib/ai-models.ts']).length === 1,
);
rec(
  'absolute effect path caught',
  hits(REPO_ROOT, [`${REPO_ROOT}/backend/src/lib/ai-models.ts`]).length === 1,
);

// Normal writes are NOT caught (zero false positives — build/codegen/formatter are safe).
rec('normal source free', hits(REPO_ROOT, ['backend/src/app.module.ts']).length === 0);
rec('dist output free', hits(REPO_ROOT, ['dist/server.js']).length === 0);
rec('outside-repo write free', hits(REPO_ROOT, ['/etc/hosts']).length === 0);

// Mixed effect: one protected file among many legit ones is still caught.
const mixed = hits(REPO_ROOT, ['backend/src/a.ts', 'CLAUDE.md', 'dist/b.js', 'frontend/src/c.tsx']);
rec(
  'mixed effect detects the single protected file',
  mixed.length === 1 && mixed[0].includes('CLAUDE.md'),
);

const ok = results.every((r) => r.ok);
if (process.argv.includes('--json')) console.log(JSON.stringify({ ok, results }, null, 2));
else for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name);
process.exit(ok ? 0 : 1);
