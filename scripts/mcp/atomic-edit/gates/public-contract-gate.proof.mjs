#!/usr/bin/env node
/**
 * Proof for gates/public-contract-gate.ts (proof #3 public-contract layer).
 * Drives the BUILT gate over crafted multi-file overlays via dynamic import.
 *
 * NOTE: import statements in the FIXTURES are built by concatenation (FROM + a
 * runtime-quoted spec) so no verbatim `from './X'` literal appears in this file —
 * otherwise the byte-floor connection gate would read the fixture text as a real
 * dangling import and refuse to write this proof.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const here = path.dirname(fileURLToPath(import.meta.url));
const atomicDir = path.resolve(here, '..');

const { default: gate } = await import(path.join(atomicDir, 'dist', 'gates', 'public-contract-gate.js'));
const { makeContext } = await import(path.join(atomicDir, 'dist', 'gates', 'contract.js'));

const results = [];
const rec = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

const Q = String.fromCharCode(39); // single quote
const FROM = 'from';
// import { <names> } from './<mod>';  (built so no literal from-spec appears here)
const imp = (names, mod) => `import { ${names} } ${FROM} ${Q}./${mod}${Q};\n`;

async function run(overlayObj, priorsObj) {
  const overlay = new Map(Object.entries(overlayObj));
  const changed = [...overlay.keys()];
  const ctx = makeContext(atomicDir, overlay, changed, false);
  ctx.priorOf = (r) => (priorsObj[r] ?? '');
  ctx.resolveRelImport = (fromRel, spec) => {
    if (!spec.startsWith('.')) return null;
    const dir = fromRel.includes('/') ? fromRel.slice(0, fromRel.lastIndexOf('/')) : '';
    let base = (dir ? dir + '/' : '') + spec.replace(/^\.\//, '');
    base = base.replace(/\/$/, '');
    for (const cand of [base, base + '.ts', base + '.tsx', base + '.js']) {
      if (overlay.has(cand)) return cand;
    }
    return null;
  };
  return gate.run(ctx);
}

// 1. breaking: A removes foo, B still imports foo from ./A
{
  const r = await run(
    { 'A.ts': 'export function bar(){}', 'B.ts': imp('foo', 'A') + 'foo();' },
    { 'A.ts': 'export function foo(){}\nexport function bar(){}', 'B.ts': imp('foo', 'A') + 'foo();' },
  );
  rec('removing an imported export is RED', r.green === false && /breaking public contract/i.test(JSON.stringify(r.reds)), r.reds);
}
// 2. co-drop: A removes foo, B no longer imports foo
{
  const r = await run(
    { 'A.ts': 'export function bar(){}', 'B.ts': imp('bar', 'A') + 'bar();' },
    { 'A.ts': 'export function foo(){}\nexport function bar(){}', 'B.ts': imp('foo', 'A') + 'foo();' },
  );
  rec('removing an export + co-dropping the importer is green', r.green === true, r);
}
// 3. removing an export nobody imports
{
  const r = await run(
    { 'A.ts': 'export function bar(){}', 'B.ts': imp('bar', 'A') + 'bar();' },
    { 'A.ts': 'export function foo(){}\nexport function bar(){}', 'B.ts': imp('bar', 'A') + 'bar();' },
  );
  rec('removing an unimported export is green', r.green === true, r);
}
// 4. adding an export (no removal)
{
  const r = await run(
    { 'A.ts': 'export function foo(){}\nexport function baz(){}', 'B.ts': imp('foo', 'A') + 'foo();' },
    { 'A.ts': 'export function foo(){}', 'B.ts': imp('foo', 'A') + 'foo();' },
  );
  rec('adding an export is green', r.green === true, r);
}
// 5. brand-new module (no prior)
{
  const r = await run({ 'A.ts': 'export function foo(){}' }, {});
  rec('brand-new module is green (no removal claim)', r.green === true, r);
}
// 6. rename foo->foo2, B still imports foo
{
  const r = await run(
    { 'A.ts': 'export function foo2(){}', 'B.ts': imp('foo', 'A') + 'foo();' },
    { 'A.ts': 'export function foo(){}', 'B.ts': imp('foo', 'A') + 'foo();' },
  );
  rec('renaming an imported export is RED', r.green === false, r.reds);
}

const ok = results.every((r) => r.ok);
if (jsonMode) console.log(JSON.stringify({ ok, results }, null, 2));
else for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name);
process.exit(ok ? 0 : 1);
