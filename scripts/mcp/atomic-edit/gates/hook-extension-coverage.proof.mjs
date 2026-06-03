#!/usr/bin/env node
/**
 * PROOF — atomic-only-hook covers the extension/verb holes (no-bypass real).
 *
 * Before this gate, native Edit/Write on .vue/.svelte/.astro/.erb files was
 * ALLOWED (CODE_EXT omitted them) and `ed`/`ex` line-editor in-place mutation of
 * code passed natively — both escaped the TUI-abolished ban. This proof spawns
 * the REAL hook with tool-call payloads and asserts deny/allow.
 *
 * Falsifiable: remove vue|svelte|astro|erb from CODE_EXT (or the ed|ex pattern)
 * and the corresponding assertions flip and this exits 1.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const hook = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'atomic-only-hook.mjs');

let failures = 0;
const results = [];

// Returns true if the hook DENIED the call.
function denied(payload) {
  const res = spawnSync(process.execPath, [hook], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  const out = res.stdout || '';
  return out.includes('"permissionDecision":"deny"') || out.includes('"permissionDecision": "deny"');
}
const edit = (file_path) => ({ tool_name: 'Edit', tool_input: { file_path } });
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const expectDeny = (payload, name) => {
  const ok = denied(payload);
  results.push({ name, ok });
  if (!ok) failures++;
};
const expectAllow = (payload, name) => {
  const ok = !denied(payload);
  results.push({ name, ok });
  if (!ok) failures++;
};

// NEW coverage — these used to slip through:
expectDeny(edit('/repo/src/App.vue'), 'native Edit on .vue DENIED');
expectDeny(edit('/repo/src/App.svelte'), 'native Edit on .svelte DENIED');
expectDeny(edit('/repo/src/page.astro'), 'native Edit on .astro DENIED');
expectDeny(edit('/repo/app/views/index.html.erb'), 'native Edit on .erb DENIED');
expectDeny(bash('ed src/foo.ts'), 'Bash `ed src/foo.ts` (line editor) DENIED');
expectDeny(bash('ex src/foo.ts'), 'Bash `ex src/foo.ts` (line editor) DENIED');

// Regression guards — existing behavior must hold:
expectDeny(edit('/repo/src/foo.ts'), 'native Edit on .ts still DENIED');
expectDeny(bash('sed -i s/a/b/ src/foo.ts'), 'Bash `sed -i` on code still DENIED');
expectAllow(edit('/repo/README.md'), 'native Edit on .md prose ALLOWED');
expectAllow(edit('/repo/notes.txt'), 'native Edit on .txt prose ALLOWED');

if (jsonMode) {
  console.log(JSON.stringify({ proof: 'hook-extension-coverage', ok: failures === 0, results }));
} else {
  for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);
  console.log(failures === 0 ? 'PROOF PASS' : `PROOF FAIL (${failures} assertion(s) failed)`);
}
process.exit(failures === 0 ? 0 : 1);
