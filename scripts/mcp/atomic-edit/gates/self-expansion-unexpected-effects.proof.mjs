#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(sourceDir, 'server-tools-self.ts'), 'utf8');
const results = [];

function record(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

const guardIndex = source.indexOf('function assertNoUnexpectedSelfExpansionEffects');
const beforeRatchetIndex = source.indexOf('assertNoUnexpectedSelfExpansionEffects(effectsBeforeRatchet, applied);');
const ratchetIndex = source.indexOf('enforceSecurityMonotonicity({ ratchet: true })');
const finalEffectIndex = source.indexOf('const effects = diffEffect(snap);', beforeRatchetIndex + 1);
const finalGuardIndex = source.indexOf('assertNoUnexpectedSelfExpansionEffects(effects, applied);');
const returnOkIndex = source.indexOf('return ok({', finalEffectIndex);

record('FileEffect type is imported for byte-effect guard', source.includes('type FileEffect'));
record(
  'self-expansion defines an unexpected-effect guard',
  guardIndex >= 0 && source.includes('self-expansion produced unrequested non-fixture effect(s)'),
  { guardIndex },
);
record(
  'guard normalizes repo-relative requested paths to selfRoot-relative effect paths',
  source.includes('function selfRootRelativeEffectPath') &&
    source.includes("const prefix = 'scripts/mcp/atomic-edit/'") &&
    source.includes('rel.startsWith(prefix) ? rel.slice(prefix.length) : rel') &&
    source.includes('selfRootRelativeEffectPath(entry.file)') &&
    source.includes('selfRootRelativeEffectPath(effect.file)'),
);
record(
  'guard allows only ephemeral proof fixtures outside requested files',
  source.includes("rel.startsWith('.proof-')") &&
    source.includes("rel.startsWith('.atomic-exec-sandbox-')") &&
    source.includes("rel.startsWith('.external-runtime-denial-')"),
);
record(
  'successful path checks effects before ratchet persistence',
  beforeRatchetIndex > guardIndex && ratchetIndex > beforeRatchetIndex,
  { guardIndex, beforeRatchetIndex, ratchetIndex },
);
record(
  'final receipt checks effects before acceptance',
  finalEffectIndex > beforeRatchetIndex && finalGuardIndex > finalEffectIndex && returnOkIndex > finalGuardIndex,
  { finalEffectIndex, finalGuardIndex, returnOkIndex },
);
record(
  'mandatory validator lattice includes this proof',
  source.includes("{ phase: 'effect-scope', command: 'node gates/self-expansion-unexpected-effects.proof.mjs --json' }"),
);

const payload = { ok: results.every((result) => result.ok), results };
if (jsonMode) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
else if (!payload.ok) process.stderr.write(JSON.stringify(payload, null, 2) + '\n');
process.exit(payload.ok ? 0 : 1);
