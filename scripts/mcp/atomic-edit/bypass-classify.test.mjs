#!/usr/bin/env node
/**
 * bypass-classify.test.mjs — table-driven proof that the classifier mirrors the
 * deny-hook vocabulary and never over/under-counts. Run: node bypass-classify.test.mjs
 */
import { classifyToolCall } from './bypass-classify.mjs';

const cases = [
  // [tool, input, expect-detectable, expect-blockedByDenyHook, expect-hasEquivalent, label]
  ['Grep', { pattern: 'foo' }, true, false, true, 'Grep -> atomic_grep, silent bypass'],
  ['Glob', { pattern: '*.ts' }, true, false, true, 'Glob -> atomic_glob, silent bypass'],
  ['Read', { file_path: 'x.ts' }, true, false, true, 'Read code -> atomic_outline, silent bypass'],
  ['Read', { file_path: 'README.md' }, false, false, false, 'Read docs -> undetectable (no atomic equiv)'],
  ['Edit', { file_path: 'x.ts' }, true, true, true, 'Edit code -> blocked by deny-hook (prevented)'],
  ['Edit', { file_path: 'notes.md' }, false, false, false, 'Edit docs -> allowed, undetectable'],
  ['Bash', { command: 'grep -rn foo src' }, true, false, true, 'bash grep -> atomic_grep, silent bypass'],
  ['Bash', { command: 'find . -name "*.ts"' }, true, false, true, 'bash find -> atomic_glob, silent bypass'],
  ['Bash', { command: "sed -i 's/a/b/' x.ts" }, true, true, true, 'sed -i code -> blocked by deny-hook'],
  ['Bash', { command: 'cat x.ts' }, true, false, true, 'cat code -> atomic_outline, silent bypass'],
  ['Bash', { command: 'git commit -m x' }, false, false, false, 'git -> undetectable (no atomic equiv)'],
  ['Bash', { command: 'npm run build' }, false, false, false, 'npm build -> undetectable'],
  ['Bash', { command: 'node dist/server.js' }, false, false, false, 'node run -> undetectable'],
];

let pass = 0;
let fail = 0;
for (const [tool, input, expDetect, expBlocked, expEquiv, label] of cases) {
  const c = classifyToolCall({ tool, toolInput: input });
  const hasEquiv = c.atomicEquivalent !== null;
  const okDetect = c.detectable === expDetect;
  const okBlocked = c.blockedByDenyHook === expBlocked;
  const okEquiv = hasEquiv === expEquiv;
  if (okDetect && okBlocked && okEquiv) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.log(
      `  FAIL  ${label} — got {detectable:${c.detectable}, blocked:${c.blockedByDenyHook}, equiv:${hasEquiv}} ` +
        `want {${expDetect}, ${expBlocked}, ${expEquiv}}`,
    );
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
