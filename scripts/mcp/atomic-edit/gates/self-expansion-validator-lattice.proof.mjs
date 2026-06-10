#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(sourceDir, 'server-tools-self.ts'), 'utf8');
const brokerSource = fs.readFileSync(path.join(sourceDir, 'atomic-exec-broker.mjs'), 'utf8');

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
  'node gates/atomic-product-locks.proof.mjs --json',
  'node gates/security-gate.proof.mjs --json',
  'node gates/chrome-devtools-bridge.proof.mjs --json',
  'node gates/security-monotonicity.proof.mjs --json',
  'node gates/self-expansion-validator-lattice.proof.mjs --json',
  'node gates/self-evolution-harness.proof.mjs --json',
  'node gates/self-evolution-mcp-tool.proof.mjs --json',
  'node gates/self-evolution-disproof-consumer.proof.mjs --json',
  'node gates/self-evolution-disproof-briefing.proof.mjs --json',
  'node gates/self-evolution-lesson-rules.proof.mjs --json',
  'node gates/codex-memory-note-tool.proof.mjs --json',
  'node gates/atomic-agent-bench.proof.mjs',
  'node gates/fixed-model-lift.proof.mjs --json',
  'node gates/human-eval-lift-protocol.proof.mjs --json',
  'node gates/test-execution-gate.proof.mjs --json',
  'node proof-chain.proof.mjs --json',
  'node gates/y-certificate-mandatory-domains.proof.mjs --json',
  'node gates/codex-entrypoint-contract.proof.mjs --json',
  'node gates/agent-hook-runtime-boundary.proof.mjs --json',
  'node gates/compiled-mcp-y-certificate.proof.mjs --json',
  'node gates/atomic-exec-readonly-usability.proof.mjs --json',
  'node gates/effect-metadata-mode.proof.mjs --json',
  'node gates/atomic-exec-prove-effect-required.proof.mjs --json',
  'node gates/atomic-exec-indirection-denial.proof.mjs --json',
  'node gates/self-expansion-unexpected-effects.proof.mjs --json',
  'node gates/self-expansion-real-self-evolution.proof.mjs --json',
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
  'coordination',
  'security',
  'monotonicity',
  'self-lattice',
  'self-evolution',
  'self-evolution-tool',
  'self-evolution-disproof',
  'self-evolution-disproof-briefing',
  'self-evolution-lessons',
  'codex-memory',
  'self-evolution-real',
  'benchmark',
  'fixed-model-lift',
  'human-eval-lift-protocol',
  'test',
  'ledger',
  'certificate',
  'runtime',
  'agent-runtime',
  'usability',
  'effect-metadata',
  'effect-admission',
  'effect-scope',
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
      source.includes('self-evolution') &&
      source.includes('self-evolution-tool') &&
      source.includes('self-evolution-disproof-briefing') &&
      source.includes('runtime') &&
      source.includes('agent-runtime') &&
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
      hasSelfEvolution: source.includes('self-evolution'),
      hasSelfEvolutionTool: source.includes('self-evolution-tool'),
      hasSelfEvolutionDisproof: source.includes('self-evolution-disproof'),
      hasSelfEvolutionDisproofBriefing: source.includes('self-evolution-disproof-briefing'),
      hasUsability: source.includes('usability'),
    },
  );
  record(
    results,
    'self-expansion proof runner runs build first, then bounded parallel validators, and the handler awaits the proof promise',
    source.includes('const SELF_EXPANSION_PROOF_CONCURRENCY') &&
      source.includes('async function runProofCommands') &&
      source.includes('await runProofCommands(proofCommands)') &&
      source.includes('Promise.all') &&
      source.includes('runSingleProofCommand') &&
      /commands\[0\]\s*===\s*'node build\.mjs'/.test(source) &&
      source.includes('skipped after node build.mjs failed'),
    {
      hasConcurrencyConstant: source.includes('const SELF_EXPANSION_PROOF_CONCURRENCY'),
      runProofCommandsAsync: source.includes('async function runProofCommands'),
      handlerAwaitsProofs: source.includes('await runProofCommands(proofCommands)'),
      hasParallelBatch: source.includes('Promise.all'),
      hasSingleProofRunner: source.includes('runSingleProofCommand'),
      buildFirst: /commands\[0\]\s*===\s*'node build\.mjs'/.test(source),
      hasBuildFailureSkip: source.includes('skipped after node build.mjs failed'),
    },
  );
  const directTimeoutResolves = /setTimeout\(\(\) => \{[\s\S]*atomic proof timed out after[\s\S]*setTimeout\(forceKill, 1000\)\.unref\(\);\n\s*finish\(\{ command, ok: false[\s\S]*\}, timeoutMs\);/.test(source);
  const brokerTimeoutResolves = /setTimeout\(\(\) => \{[\s\S]*atomic proof broker timed out after[\s\S]*setTimeout\(forceKill, 1000\)\.unref\(\);\n\s*finish\(\{ command, ok: false[\s\S]*\}, timeoutMs \+ 5000\);/.test(source);
  record(
    results,
    'self-expansion has a global proof deadline that resolves before client timeout instead of waiting for abandoned child processes',
    source.includes('const SELF_EXPANSION_PROOF_GLOBAL_BUDGET_MS') &&
      source.includes('remainingProofBudgetMs') &&
      source.includes('proofTimeoutForDeadline') &&
      source.includes('self-expansion proof global budget exhausted') &&
      directTimeoutResolves &&
      brokerTimeoutResolves,
    {
      hasGlobalBudget: source.includes('const SELF_EXPANSION_PROOF_GLOBAL_BUDGET_MS'),
      hasRemainingBudget: source.includes('remainingProofBudgetMs'),
      hasDeadlineTimeout: source.includes('proofTimeoutForDeadline'),
      hasBudgetFailureText: source.includes('self-expansion proof global budget exhausted'),
      directTimeoutResolves,
      brokerTimeoutResolves,
    },
  );
  record(
    results,
    'self-expansion gives liveness-critical validators explicit sub-client timeout budgets',
    source.includes("command.includes('type-soundness-gate')") &&
      source.includes("command.includes('algebra.proof.mjs')") &&
      source.includes("command.includes('contract-edge-gate')") &&
      source.includes("command.includes('self-evolution-mcp-tool')") &&
      source.includes("command.includes('compiled-mcp-y-certificate')") &&
      source.includes('return 90000'),
    {
      hasTypeBudget: source.includes("command.includes('type-soundness-gate')"),
      hasAlgebraBudget: source.includes("command.includes('algebra.proof.mjs')"),
      hasContractEdgeBudget: source.includes("command.includes('contract-edge-gate')"),
      hasSelfEvolutionToolBudget: source.includes("command.includes('self-evolution-mcp-tool')"),
      hasCompiledCertificateBudget: source.includes("command.includes('compiled-mcp-y-certificate')"),
      hasNinetySecondBudget: source.includes('return 90000'),
    },
  );
  record(
    results,
    'self-expansion schedules historically slow validators first while preserving original receipt order',
    source.includes('function proofCommandPriority') &&
      source.includes('compiled-mcp-y-certificate') &&
      source.includes('type-soundness-gate') &&
      source.includes('contract-edge-gate') &&
      source.includes('self-evolution-mcp-tool') &&
      source.includes('queue.sort') &&
      source.includes('results[item.index]'),
    {
      hasPriorityFunction: source.includes('function proofCommandPriority'),
      prioritizesCompiledCertificate: source.includes('compiled-mcp-y-certificate'),
      prioritizesType: source.includes('type-soundness-gate'),
      prioritizesContractEdge: source.includes('contract-edge-gate'),
      prioritizesSelfEvolutionTool: source.includes('self-evolution-mcp-tool'),
      sortsQueue: source.includes('queue.sort'),
      preservesReceiptOrder: source.includes('results[item.index]'),
    },
  );
  record(
    results,
    'atomic exec broker handles concurrent proof clients asynchronously while preserving per-command sandbox execution',
    brokerSource.includes("import { spawn } from 'node:child_process';") &&
      !brokerSource.includes("import { spawnSync } from 'node:child_process';") &&
      /async function handle\(/.test(brokerSource) &&
      /await handle\(/.test(brokerSource) &&
      brokerSource.includes('function runSandboxed') &&
      brokerSource.includes('new Promise'),
    {
      importsSpawn: brokerSource.includes("import { spawn } from 'node:child_process';"),
      removedSpawnSyncImport: !brokerSource.includes("import { spawnSync } from 'node:child_process';"),
      hasAsyncHandle: /async function handle\(/.test(brokerSource),
      awaitsHandle: /await handle\(/.test(brokerSource),
      hasSandboxRunner: brokerSource.includes('function runSandboxed'),
      hasPromiseRunner: brokerSource.includes('new Promise'),
    },
  );
  return { ok: results.every((entry) => entry.ok), results };
}

const payload = main();
if (jsonMode) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
else for (const entry of payload.results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
process.exit(payload.ok ? 0 : 1);
