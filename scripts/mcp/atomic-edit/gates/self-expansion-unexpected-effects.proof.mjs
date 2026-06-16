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
const prePromotionIndex = source.indexOf('assertNoUnexpectedSelfExpansionEffects(effectsBeforePromotion, applied);');
const promotionIndex = source.indexOf('const promotionReceipt = buildRealSelfExpansionPromotionReceipt');
const archiveIndex = source.indexOf('const selfEvolutionArchive = appendRealSelfExpansionArchive');
const ratchetIndex = source.indexOf('enforceSecurityMonotonicity({ ratchet: true })');
const finalEffectIndex = source.indexOf('const effects = diffEffect(snap);', archiveIndex + 1);
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
  'guard allows only ephemeral proof fixtures, the named self-evolution archive, and launcher durability metadata',
  source.includes("rel.startsWith('.proof-')") &&
    source.includes("rel.startsWith('.smoke-')") &&
    source.includes("rel.startsWith('.self-expansion-')") &&
    source.includes("rel.startsWith('.atomic-exec-sandbox-')") &&
    source.includes("rel.startsWith('.external-runtime-denial-')") &&
    source.includes("rel.startsWith('atomic-exec-broker-file-')") &&
    source.includes("rel.startsWith('.whole-host-launcher-allowed-')") &&
    source.includes("/^\\.atomic-edit\\.\\d+\\.\\d+\\.tmp$/.test(rel)") &&
    source.includes("rel.startsWith('property-gate-')") &&
    source.includes('function isSelfEvolutionArchiveEffect') &&
    source.includes("return file === SELF_EVOLUTION_ARCHIVE_REL") &&
    source.includes('!isSelfEvolutionArchiveEffect(rel)') &&
    source.includes('function isLauncherDurabilityMetadataEffect') &&
    source.includes("file.startsWith('dist-lkg/')") &&
    source.includes("file.startsWith('dist.broken-last/')") &&
    source.includes("file === 'launcher-blessed/.blessed-manifest.json'") &&
    source.includes('!isLauncherDurabilityMetadataEffect(rel)'),
);
record(
  'successful path checks requested effects before promotion, then builds receipt, archives it, ratchets, and checks final effects before acceptance',
  prePromotionIndex > guardIndex &&
    promotionIndex > prePromotionIndex &&
    archiveIndex > promotionIndex &&
    ratchetIndex > archiveIndex &&
    finalEffectIndex > ratchetIndex &&
    finalGuardIndex > finalEffectIndex &&
    returnOkIndex > finalGuardIndex,
  { guardIndex, prePromotionIndex, promotionIndex, archiveIndex, ratchetIndex, finalEffectIndex, finalGuardIndex, returnOkIndex },
);
record(
  'mandatory validator lattice includes this proof',
  source.includes("{ phase: 'effect-scope', command: 'node gates/self-expansion-unexpected-effects.proof.mjs --json' }"),
);

const payload = { ok: results.every((result) => result.ok), results };
if (jsonMode) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
else if (!payload.ok) process.stderr.write(JSON.stringify(payload, null, 2) + '\n');
process.exit(payload.ok ? 0 : 1);
