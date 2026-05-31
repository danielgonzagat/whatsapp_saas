#!/usr/bin/env node
/**
 * contract.alias.proof.mjs — standalone node proof for the tsconfig path-alias
 * branch added to makeContext().resolveRelImport (red class #6).
 *
 * Run:  node scripts/mcp/atomic-edit/build.mjs \
 *    && node scripts/mcp/atomic-edit/gates/contract.alias.proof.mjs
 *
 * WHAT THIS PROVES (and the honest ceiling).
 *
 * BEFORE this branch, resolveRelImport returned null for ANY non-'.' specifier,
 * so a '@/...' import was green-by-skip in the connection gate (reachability):
 * it was never an edge, so a DANGLING '@/' alias could never be reddened, and the
 * lens could never list one. The branch adds tsconfig `compilerOptions.paths`
 * resolution + KLOEL's '@/*' -> '<package>/src/*' convention, then runs the SAME
 * candidate-extension probe the '.'-relative branch always used.
 *
 * The proof attacks the runtime resolution fact in BOTH polarities, plus the
 * preservation of the pre-existing relative behaviour, plus the honest-null floor:
 *
 *   ALIAS-RESOLVES  (green pole) — a '@/'-import to a file that REALLY exists
 *     resolves to that repo-relative path. Proven two ways:
 *       (a) via frontend/tsconfig.json's explicit { "@/*": ["./src/*"] } paths
 *           entry (the config-driven source), and
 *       (b) via the KLOEL '@/' convention for a backend file whose tsconfig has
 *           NO `paths` (so only the convention branch can resolve it).
 *     => the connection gate now grows its closure across a real alias edge.
 *   ALIAS-DANGLES   (red pole) — a '@/'-import to a file that does NOT exist
 *     resolves to null. null is the signal the connection gate turns into a red:
 *     "import '@/...' resolves to nothing". So a NEW dangling alias is now
 *     reddenable (delta-protected on write, absolute under the lens).
 *   BARE-STAYS-NULL (honest floor / Rice line) — a bare package specifier
 *     ('react') stays null: it is the supply-chain gate's concern, NOT a
 *     relative/alias fact. The resolver does not guess a node_modules path.
 *   RELATIVE-UNCHANGED (regression pole) — a '.'-relative import resolves with
 *     byte-identical semantics to before: a real sibling resolves, a missing one
 *     is null. The additive edit did not perturb the relative branch.
 *   OVERLAY-AWARE — an alias target present ONLY in the write-direction overlay
 *     (not yet on disk) resolves, so the WRITE floor sees a just-created alias
 *     target exactly as the LENS sees a committed one.
 *
 * HONEST CEILING / Rice line. This resolver decides a STATIC, SYNTACTIC fact:
 * "does this literal specifier expand (via the file's nearest tsconfig paths or
 * the '@/' convention) to a file that exists in overlay-or-disk?". It is sound
 * for literal specifiers. It is NOT a full TS module resolver: it does not honour
 * `references`/project composition, `extends`-chained `paths`, `rootDirs`,
 * conditional `exports`, symlink realpath, or case-insensitive FS collisions; and
 * a DYNAMIC specifier (import(`@/${x}`)) is not a literal, so it is never an edge
 * here. In every one of those cases the function returns null — which the
 * connection gate treats as "no resolved edge", NOT as a red by itself: a red is
 * only emitted when a perceived literal import edge fails to resolve. Bare
 * specifiers returning null is deliberate (supply-chain owns them). Thus the
 * function never reds-by-guess and never greens-by-assumption — it states only the
 * one fact it can decide from the bytes it has.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dir, '..', '..', '..', '..');
const { makeContext } = await import(path.join(dir, '..', 'dist', 'gates', 'contract.js'));

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log('  PASS ', name); }
  else { fail += 1; console.log('  FAIL ', name); }
};

// Pick REAL committed files as resolution targets so the proof is grounded in the
// actual tree, not a synthetic fixture. Skip a case (do not fail) only if the
// anchor file genuinely vanished from the repo — that is an environment fact, not
// a resolver regression. These three are long-stable KLOEL surfaces.
const FE_TARGET_A = 'frontend/src/lib/api/core.ts'; // @/lib/api/core via tsconfig paths
const FE_TARGET_B = 'frontend/src/lib/design-tokens.ts'; // @/lib/design-tokens via tsconfig paths
const BE_TARGET = 'backend/src/lib/ai-models.ts'; // @/lib/ai-models via KLOEL convention (backend has no paths)
const haveFE = fs.existsSync(path.join(repoRoot, FE_TARGET_A)) && fs.existsSync(path.join(repoRoot, FE_TARGET_B));
const haveBE = fs.existsSync(path.join(repoRoot, BE_TARGET));

// LENS-direction context (no overlay) — judges committed bytes absolutely.
const ctx = makeContext(repoRoot, new Map(), [], /* lensMode */ true);

// ── ALIAS-RESOLVES (green) via tsconfig paths: frontend '@/*' -> './src/*' ─────
if (haveFE) {
  const fromFe = 'frontend/src/app/page.tsx'; // an importing file under frontend/
  const r1 = ctx.resolveRelImport(fromFe, '@/lib/api/core');
  check('ALIAS-RESOLVES @/lib/api/core (frontend tsconfig paths) -> real file', r1 === FE_TARGET_A);
  const r2 = ctx.resolveRelImport(fromFe, '@/lib/design-tokens');
  check('ALIAS-RESOLVES @/lib/design-tokens (frontend tsconfig paths) -> real file', r2 === FE_TARGET_B);
} else {
  console.log('  SKIP  frontend alias-resolve cases — anchor files absent from tree (environment, not regression)');
}

// ── ALIAS-RESOLVES (green) via KLOEL '@/' convention: backend has NO paths ─────
if (haveBE) {
  const fromBe = 'backend/src/app.module.ts';
  const r3 = ctx.resolveRelImport(fromBe, '@/lib/ai-models');
  check('ALIAS-RESOLVES @/lib/ai-models (backend KLOEL convention, no tsconfig paths) -> real file', r3 === BE_TARGET);
} else {
  console.log('  SKIP  backend convention case — anchor file absent from tree (environment, not regression)');
}

// ── ALIAS-DANGLES (red pole): a '@/' alias to a nonexistent file -> null ───────
{
  const fromFe = 'frontend/src/app/page.tsx';
  const dangling = ctx.resolveRelImport(fromFe, '@/lib/__definitely_not_a_real_module_zzz__');
  check('ALIAS-DANGLES @/... to nonexistent file -> null (connection gate would red this)', dangling === null);
  // Same alias-shape from a backend file (convention branch) also dangles to null.
  const fromBe = 'backend/src/app.module.ts';
  const danglingBe = ctx.resolveRelImport(fromBe, '@/__definitely_not_a_real_backend_module_zzz__');
  check('ALIAS-DANGLES @/... (backend convention) to nonexistent file -> null', danglingBe === null);
}

// ── BARE-STAYS-NULL (honest floor / Rice line): supply-chain's concern ─────────
{
  const fromFe = 'frontend/src/app/page.tsx';
  check('BARE-STAYS-NULL bare specifier "react" -> null (supply-chain, not alias)', ctx.resolveRelImport(fromFe, 'react') === null);
  check('BARE-STAYS-NULL scoped pkg "@nestjs/common" -> null (NOT mistaken for an @/ alias)', ctx.resolveRelImport('backend/src/app.module.ts', '@nestjs/common') === null);
}

// ── RELATIVE-UNCHANGED (regression pole): the '.'-branch is byte-identical ─────
if (haveFE) {
  // A '.'-relative import FROM a real sibling TO that same target must resolve.
  // page.tsx and core.ts both live under frontend/src/... so a relative path works.
  const fromFe = 'frontend/src/lib/api/index.ts';
  const rel = ctx.resolveRelImport(fromFe, './core');
  check('RELATIVE-UNCHANGED ./core sibling -> resolves to the real file', rel === FE_TARGET_A);
  const relMissing = ctx.resolveRelImport(fromFe, './__no_such_sibling_zzz__');
  check('RELATIVE-UNCHANGED ./missing sibling -> null (unchanged)', relMissing === null);
} else {
  console.log('  SKIP  relative-unchanged cases — anchor files absent from tree');
}

// ── OVERLAY-AWARE: an alias target present ONLY in the overlay resolves ────────
// (WRITE floor parity — a just-created '@/' target is seen before it hits disk.)
{
  const overlay = new Map();
  // A brand-new frontend module that exists ONLY in the write set.
  overlay.set('frontend/src/lib/__overlay_only_module__.ts', 'export const x = 1;\n');
  const wctx = makeContext(repoRoot, overlay, ['frontend/src/lib/__overlay_only_module__.ts'], /* lensMode */ false);
  const fromFe = 'frontend/src/app/page.tsx';
  const r = wctx.resolveRelImport(fromFe, '@/lib/__overlay_only_module__');
  check('OVERLAY-AWARE @/... to an overlay-only (not-on-disk) target resolves', r === 'frontend/src/lib/__overlay_only_module__.ts');
  // And a DISK-only check via lens context (overlay empty) for the same path is null.
  const r2 = ctx.resolveRelImport(fromFe, '@/lib/__overlay_only_module__');
  check('OVERLAY-AWARE same target WITHOUT overlay -> null (it is not committed)', r2 === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
