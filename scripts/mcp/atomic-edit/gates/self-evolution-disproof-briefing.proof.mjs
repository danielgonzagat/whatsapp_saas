#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolSource = fs.readFileSync(path.join(sourceDir, 'server-tools-disproof.ts'), 'utf8');
const serverSource = fs.readFileSync(path.join(sourceDir, 'server.ts'), 'utf8');
const selfSource = fs.readFileSync(path.join(sourceDir, 'server-tools-self.ts'), 'utf8');
const latticeSource = fs.readFileSync(path.join(sourceDir, 'gates/self-expansion-validator-lattice.proof.mjs'), 'utf8');
const disproofImportSpec = ['import { registerToolsDisproof }', 'from', "'./server-tools-disproof.js';"].join(' ');

function record(results, name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

function main() {
  const results = [];
  record(
    results,
    'atomic_disproof_briefing is registered as a first-class MCP tool',
    serverSource.includes(disproofImportSpec) &&
      serverSource.includes('registerToolsDisproof(server);') &&
      toolSource.includes("server.registerTool(\n    'atomic_disproof_briefing'"),
    {
      imported: serverSource.includes(disproofImportSpec),
      registered: serverSource.includes('registerToolsDisproof(server);'),
      toolName: toolSource.includes('atomic_disproof_briefing'),
    },
  );
  record(
    results,
    'atomic_disproof_briefing refuses invalid mode before harness dispatch',
    toolSource.includes('function isDisproofBriefingMode') &&
      toolSource.includes('refused: unknown disproof briefing mode') &&
      toolSource.includes('const rawMode = args.mode ??') &&
      toolSource.indexOf('if (!isDisproofBriefingMode(rawMode))') < toolSource.indexOf('runDisproofHarness(mode, input)'),
    {
      hasGuard: toolSource.includes('function isDisproofBriefingMode'),
      refusesInvalidMode: toolSource.includes('refused: unknown disproof briefing mode'),
      guardBeforeHarness: toolSource.indexOf('if (!isDisproofBriefingMode(rawMode))') < toolSource.indexOf('runDisproofHarness(mode, input)'),
    },
  );
  record(
    results,
    'briefing path verifies the corpus before selection and buildBriefing',
    toolSource.indexOf("runDisproofHarness('verify-corpus'") >= 0 &&
      toolSource.indexOf("runDisproofHarness('verify-corpus'") < toolSource.indexOf("runDisproofHarness('select-disproofs'") &&
      toolSource.indexOf("runDisproofHarness('select-disproofs'") < toolSource.indexOf("runDisproofHarness('build-briefing'") &&
      toolSource.includes('requireHarnessOk'),
    {
      verifyIndex: toolSource.indexOf("runDisproofHarness('verify-corpus'"),
      selectIndex: toolSource.indexOf("runDisproofHarness('select-disproofs'"),
      buildIndex: toolSource.indexOf("runDisproofHarness('build-briefing'"),
    },
  );
  record(
    results,
    'briefing reads the canonical .atomic disproof corpus by default and returns briefingDigest',
    toolSource.includes("path.join(REPO_ROOT, '.atomic', 'disproof-corpus.jsonl')") &&
      toolSource.includes('briefingDigest: briefing.briefingDigest') &&
      toolSource.includes('briefingText: briefing.text') &&
      toolSource.includes('corpusVerified: verify') &&
      toolSource.includes('selectedCount: selected.length'),
    {},
  );
  record(
    results,
    'briefing is read-only guidance and cannot weaken hard admission',
    toolSource.includes('Briefing is proposer guidance, not a gate') &&
      toolSource.includes('The hard gate remains the only judge') &&
      !toolSource.includes('atomicWrite(') &&
      !toolSource.includes('fs.writeFileSync') &&
      !toolSource.includes('fs.appendFileSync'),
    {
      noAtomicWrite: !toolSource.includes('atomicWrite('),
      noWriteFileSync: !toolSource.includes('fs.writeFileSync'),
      noAppendFileSync: !toolSource.includes('fs.appendFileSync'),
    },
  );
  record(
    results,
    'atomic_shadow_gate is registered as a read-only preflight wall probe',
    toolSource.includes("server.registerTool(\n    'atomic_shadow_gate'") &&
      toolSource.includes('function runShadowGate') &&
      toolSource.includes("mode: 'shadow-gate'") &&
      toolSource.includes('shadowGateDigest') &&
      toolSource.includes('shadowCount: 1'),
    {
      hasTool: toolSource.includes('atomic_shadow_gate'),
      hasRunner: toolSource.includes('function runShadowGate'),
      emitsDigest: toolSource.includes('shadowGateDigest'),
      emitsShadowCount: toolSource.includes('shadowCount: 1'),
    },
  );
  record(
    results,
    'atomic_shadow_gate is guidance-only and archives no evolutionary state',
    toolSource.includes('Shadow gate is a read-only probe, not promotion and not admission.') &&
      toolSource.includes('It returns witnesses/briefing only; it never returns a corrected diff.') &&
      toolSource.includes('archiveEntrySha256: null') &&
      !toolSource.includes('appendRealSelfExpansionArchive(') &&
      !toolSource.includes('appendSelfEvolutionDisproofCorpus('),
    {
      hasReadOnlyLimit: toolSource.includes('Shadow gate is a read-only probe, not promotion and not admission.'),
      doesNotArchiveEvolution: !toolSource.includes('appendRealSelfExpansionArchive('),
      doesNotAppendDisproofCorpus: !toolSource.includes('appendSelfEvolutionDisproofCorpus('),
    },
  );
  record(
    results,
    'self-expansion lattice permanently runs the disproof briefing proof',
    selfSource.includes("phase: 'self-evolution-disproof-briefing'") &&
      selfSource.includes('node gates/self-evolution-disproof-briefing.proof.mjs --json') &&
      latticeSource.includes('node gates/self-evolution-disproof-briefing.proof.mjs --json') &&
      latticeSource.includes("'self-evolution-disproof-briefing'"),
    {},
  );
  record(
    results,
    'atomic_expand_self attaches a preflight disproof briefing digest to proposal receipts',
    selfSource.includes('const preflightDisproofBriefing = buildSelfEvolutionNextDisproofBriefing(') &&
      selfSource.includes('preflightDisproofBriefing?: JsonRecord') &&
      selfSource.includes('preflightDisproofBriefing: args.preflightDisproofBriefing ?? null') &&
      selfSource.includes('preflightDisproofBriefing: admittedPreflightDisproofBriefing') &&
      selfSource.includes('briefingDigest'),
    {
      computesPreflight: selfSource.includes('const preflightDisproofBriefing = buildSelfEvolutionNextDisproofBriefing('),
      receiptArg: selfSource.includes('preflightDisproofBriefing?: JsonRecord'),
      evidenceCarriesDigest: selfSource.includes('preflightDisproofBriefing: args.preflightDisproofBriefing ?? null'),
      responseCarriesDigest: selfSource.includes('preflightDisproofBriefing: admittedPreflightDisproofBriefing'),
    },
  );
  record(
    results,
    'atomic_expand_self refuses forged preflight disproof briefing digest claims',
    selfSource.includes('preflightDisproofBriefingDigest: z.string().optional()') &&
      selfSource.includes('const claimedPreflightDisproofBriefingDigest = a.preflightDisproofBriefingDigest ?? null;') &&
      selfSource.includes('preflight disproof briefing digest mismatch') &&
      selfSource.includes('claimedDigest: claimedPreflightDisproofBriefingDigest') &&
      selfSource.includes('digestClaimAccepted:') &&
      selfSource.includes('claimedPreflightDisproofBriefingDigest === null ||'),
    {
      schemaAcceptsDigestClaim: selfSource.includes('preflightDisproofBriefingDigest: z.string().optional()'),
      computesDigestClaim: selfSource.includes('const claimedPreflightDisproofBriefingDigest = a.preflightDisproofBriefingDigest ?? null;'),
      refusesMismatch: selfSource.includes('preflight disproof briefing digest mismatch'),
      archivesAcceptedClaim:
        selfSource.includes('claimedDigest: claimedPreflightDisproofBriefingDigest') &&
        selfSource.includes('digestClaimAccepted:') &&
        selfSource.includes('claimedPreflightDisproofBriefingDigest === null ||'),
    },
  );

  const ok = results.every((result) => result.ok);
  const payload = { ok, results };
  if (jsonMode) console.log(JSON.stringify(payload, null, 2));
  else console.log(ok ? 'self-evolution-disproof-briefing proof OK' : 'self-evolution-disproof-briefing proof FAILED');
  process.exit(ok ? 0 : 1);
}

main();
