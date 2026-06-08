#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(sourceDir, 'server-tools-self.ts'), 'utf8');

const requiredCommands = [
  'node build.mjs',
  'node gates/dist-live-integrity.proof.mjs --json',
  'node gates/dist-freshness.proof.mjs --json',
  'node gates/type-soundness-gate.proof.mjs --json',
  'node gates/structural-lint-gate.proof.mjs --json',
  'node gates/algebra.proof.mjs',
  'node gates/closure-universal.proof.mjs',
  'node gates/merge.proof.mjs',
  'node dist/gates/reachability-gate.proof.js',
  'node dist/gates/binding-gate.proof.js',
  'node gates/converge-operator.proof.mjs',
  'node dist/gates/probe-convergence-gate.proof.js',
  'node dist/gates/formal-gate.proof.js',
  'node dist/gates/property-gate.proof.js',
  'node dist/gates/findings-delta-gate.proof.js',
  'node dist/gates/contract-edge-gate.proof.js',
  'node gates/public-contract-gate.proof.mjs --json',
  'node gates/behavior-contract-gate.proof.mjs --json',
  'node gates/security-gate.proof.mjs --json',
  'node gates/security-monotonicity.proof.mjs --json',
  'node gates/test-execution-gate.proof.mjs --json',
  'node proof-chain.proof.mjs --json',
  'node gates/y-certificate-mandatory-domains.proof.mjs --json',
  'node gates/codex-entrypoint-contract.proof.mjs --json',
  'node gates/compiled-mcp-y-certificate.proof.mjs --json',
  'node gates/atomic-exec-readonly-usability.proof.mjs --json',
  'node codex-atomic-only-hook.proof.mjs --json',
];

const requiredPhases = [
  'build',
  'runtime-integrity',
  'runtime-freshness',
  'type',
  'semantic',
  'semantic-impact',
  'reachability',
  'binding',
  'convergence',
  'runtime-probe',
  'formal',
  'property',
  'findings-delta',
  'contract-edge',
  'public-contract',
  'behavior',
  'security',
  'monotonicity',
  'test',
  'ledger',
  'certificate',
  'runtime',
  'usability',
  'no-bypass',
];

function record(results, name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

function main() {
  const results = [];
  const missing = requiredCommands.filter((command) => !source.includes(command));
  const missingPhases = requiredPhases.filter((phase) => !source.includes(`phase: '${phase}'`));
  record(
    results,
    'atomic_expand_self has a mandatory validator lattice beyond typecheck, including runtime-freshness, offline reachability, binding, formal, property, findings-delta, contract-edge, runtime-probe, semantic-impact, monotonicity, and read-only exec usability',
    source.includes('MANDATORY_SELF_EXPANSION_VALIDATORS') && missing.length === 0 && missingPhases.length === 0,
    { missing, missingPhases },
  );
  record(
    results,
    'caller proofCommands are additive and cannot replace mandatory validators',
    source.includes('normalizeSelfExpansionProofCommands') &&
      /const proofCommands = normalizeSelfExpansionProofCommands\(a\.proofCommands\);/.test(source) &&
      !source.includes("a.proofCommands ?? ['node build.mjs', 'node codex-atomic-only-hook.proof.mjs --json']"),
    {
      hasNormalizer: source.includes('normalizeSelfExpansionProofCommands'),
      oldDefaultRemoved: !source.includes("a.proofCommands ?? ['node build.mjs', 'node codex-atomic-only-hook.proof.mjs --json']"),
    },
  );
  record(
    results,
    'receipt exposes validator lattice phases instead of a flat typecheck-only proof list',
    source.includes('validatorLattice: MANDATORY_SELF_EXPANSION_VALIDATORS') &&
      source.includes('phase') &&
      source.includes('runtime-freshness') &&
      source.includes('semantic') &&
      source.includes('semantic-impact') &&
      source.includes('reachability') &&
      source.includes('binding') &&
      source.includes('convergence') &&
      source.includes('runtime-probe') &&
      source.includes('formal') &&
      source.includes('property') &&
      source.includes('findings-delta') &&
      source.includes('contract-edge') &&
      source.includes('security') &&
      source.includes('monotonicity') &&
      source.includes('runtime') &&
      source.includes('usability'),
    {
      hasReceipt: source.includes('validatorLattice: MANDATORY_SELF_EXPANSION_VALIDATORS'),
      hasPhase: source.includes('phase'),
      hasRuntimeFreshness: source.includes('runtime-freshness'),
      hasSemanticImpact: source.includes('semantic-impact'),
      hasReachability: source.includes('reachability'),
      hasBinding: source.includes('binding'),
      hasConvergence: source.includes('convergence'),
      hasRuntimeProbe: source.includes('runtime-probe'),
      hasFormal: source.includes('formal'),
      hasProperty: source.includes('property'),
      hasFindingsDelta: source.includes('findings-delta'),
      hasContractEdge: source.includes('contract-edge'),
      hasMonotonicity: source.includes('monotonicity'),
      hasUsability: source.includes('usability'),
    },
  );
  return { ok: results.every((entry) => entry.ok), results };
}

const payload = main();
if (jsonMode) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
else for (const entry of payload.results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
process.exit(payload.ok ? 0 : 1);
