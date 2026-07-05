#!/usr/bin/env node
/**
 * protected-extension-topology.proof.mjs - executable proof for the generic
 * protected-core extension topology classifier used by the A/B loop.
 */
const {
  classifyProtectedExtensionTopology,
  runCli,
} = await import('./protected-extension-topology-harness.mjs');

const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok: ok === true, detail: detail ?? null });
const blockerKinds = (result) => (Array.isArray(result.blockers) ? result.blockers.map((blocker) => blocker.kind) : []);
const warningKinds = (result) => (Array.isArray(result.warnings) ? result.warnings.map((warning) => warning.kind) : []);

const validAdapter = classifyProtectedExtensionTopology({
  changedFiles: [
    { path: 'src/public/index.ts', additions: 1, deletions: 0, status: 'M' },
    { path: 'src/feature/adapter.ts', additions: 20, deletions: 0, status: 'A' },
  ],
  protectedPaths: ['src/core/engine.ts'],
  runtimeEntrypoints: ['src/public/index.ts'],
  requirePublicEntrypointWiring: true,
  testChangesAllowed: false,
  fileTexts: {
    'src/public/index.ts': "export { FeatureAdapter } from '../feature/adapter.js';\n",
    'src/feature/adapter.ts': 'export class FeatureAdapter {}\n',
  },
});
check('accepts-publicly-wired-adapter-that-preserves-protected-core-and-tests', validAdapter.ok === true, JSON.stringify(validAdapter));

const directProtectedConsumer = classifyProtectedExtensionTopology({
  changedFiles: [
    { path: 'src/public/index.ts', additions: 1, deletions: 0, status: 'M' },
    { path: 'src/feature/adapter.ts', additions: 20, deletions: 0, status: 'A' },
  ],
  protectedPaths: ['src/core/engine.ts'],
  runtimeEntrypoints: ['src/public/index.ts'],
  acceptanceEntrypoints: ['src/__tests__/engine.test.ts'],
  requirePublicEntrypointWiring: true,
  requireAcceptanceEntrypointCoverage: true,
  testChangesAllowed: false,
  fileTexts: {
    'src/public/index.ts': "export { FeatureAdapter } from '../feature/adapter.js';\n",
    'src/feature/adapter.ts': 'export class FeatureAdapter {}\n',
    'src/__tests__/engine.test.ts': "import { Engine } from '../core/engine.js';\n",
  },
});
check(
  'blocks-public-adapter-when-acceptance-consumer-direct-imports-protected-path',
  directProtectedConsumer.ok === false
    && blockerKinds(directProtectedConsumer).includes('DIRECT_PROTECTED_IMPORT_CONSUMER_UNSERVED')
    && JSON.stringify(directProtectedConsumer).includes('src/core/engine.ts'),
  JSON.stringify(directProtectedConsumer),
);

const directProtectedConsumerPreflight = classifyProtectedExtensionTopology({
  changedFiles: [],
  protectedPaths: ['src/core/engine.ts'],
  acceptanceEntrypoints: ['src/__tests__/engine.test.ts'],
  blockDirectProtectedAcceptanceConsumers: true,
  fileTexts: {
    'src/__tests__/engine.test.ts': "import { Engine } from '../core/engine.js';\n",
  },
});
check(
  'preflight-blocks-direct-protected-consumer-before-side-adapter-exists',
  directProtectedConsumerPreflight.ok === false
    && blockerKinds(directProtectedConsumerPreflight).includes('DIRECT_PROTECTED_IMPORT_CONSUMER_UNSERVED')
    && JSON.stringify(directProtectedConsumerPreflight).includes('src/core/engine.ts'),
  JSON.stringify(directProtectedConsumerPreflight),
);

const directProtectedConsumerObservationOnly = classifyProtectedExtensionTopology({
  changedFiles: [],
  protectedPaths: ['src/core/engine.ts'],
  acceptanceEntrypoints: ['src/__tests__/engine.test.ts'],
  fileTexts: {
    'src/__tests__/engine.test.ts': "import { Engine } from '../core/engine.js';\n",
  },
});
check(
  'direct-protected-consumer-is-finding-only-without-preflight-blocker',
  directProtectedConsumerObservationOnly.ok === true
    && JSON.stringify(directProtectedConsumerObservationOnly).includes('DIRECT_PROTECTED_ACCEPTANCE_CONSUMERS'),
  JSON.stringify(directProtectedConsumerObservationOnly),
);

const publicEntrypointConsumer = classifyProtectedExtensionTopology({
  changedFiles: [
    { path: 'src/public/index.ts', additions: 1, deletions: 0, status: 'M' },
    { path: 'src/feature/adapter.ts', additions: 20, deletions: 0, status: 'A' },
  ],
  protectedPaths: ['src/core/engine.ts'],
  runtimeEntrypoints: ['src/public/index.ts'],
  acceptanceEntrypoints: ['src/__tests__/engine.test.ts'],
  requirePublicEntrypointWiring: true,
  requireAcceptanceEntrypointCoverage: true,
  testChangesAllowed: false,
  fileTexts: {
    'src/public/index.ts': "export { FeatureAdapter } from '../feature/adapter.js';\n",
    'src/feature/adapter.ts': 'export class FeatureAdapter {}\n',
    'src/__tests__/engine.test.ts': "import { FeatureAdapter } from '../public/index.js';\n",
  },
});
check(
  'accepts-public-adapter-when-acceptance-consumer-enters-through-public-entrypoint',
  publicEntrypointConsumer.ok === true,
  JSON.stringify(publicEntrypointConsumer),
);

const protectedMutation = classifyProtectedExtensionTopology({
  changedFiles: [{ path: 'src/core/engine.ts', additions: 3, deletions: 1, status: 'M' }],
  protectedPaths: ['src/core/engine.ts'],
  runtimeEntrypoints: ['src/public/index.ts'],
  fileTexts: { 'src/core/engine.ts': 'export const changed = true;\n' },
});
check(
  'blocks-protected-file-mutation',
  protectedMutation.ok === false && blockerKinds(protectedMutation).includes('PROTECTED_FILE_MUTATION'),
  JSON.stringify(protectedMutation),
);

const governedProtectedMutation = classifyProtectedExtensionTopology({
  changedFiles: [{ path: 'src/core/engine.ts', additions: 3, deletions: 1, status: 'M' }],
  protectedPaths: ['src/core/engine.ts'],
  allowGovernedProtectedMutations: true,
  governedProtectedMutations: [{
    path: 'src/core/engine.ts',
    intent: 'satisfy required consumers while preserving protected API shape',
    validationPlan: ['typecheck', 'targeted-tests'],
    receipt: 'trace:op-governed-engine-change',
  }],
  fileTexts: { 'src/core/engine.ts': 'export const changed = true;\n' },
});
check(
  'allows-protected-file-mutation-only-with-governed-override-warning',
  governedProtectedMutation.ok === true
    && warningKinds(governedProtectedMutation).includes('GOVERNED_PROTECTED_MUTATION_ALLOWED')
    && !blockerKinds(governedProtectedMutation).includes('PROTECTED_FILE_MUTATION'),
  JSON.stringify(governedProtectedMutation),
);

const incompleteGovernedProtectedMutation = classifyProtectedExtensionTopology({
  changedFiles: [{ path: 'src/core/engine.ts', additions: 3, deletions: 1, status: 'M' }],
  protectedPaths: ['src/core/engine.ts'],
  allowGovernedProtectedMutations: true,
  governedProtectedMutations: [{
    path: 'src/core/engine.ts',
    intent: 'missing validation plan is not enough',
    receipt: 'trace:op-incomplete',
  }],
  fileTexts: { 'src/core/engine.ts': 'export const changed = true;\n' },
});
check(
  'blocks-protected-file-mutation-when-governed-proof-is-incomplete',
  incompleteGovernedProtectedMutation.ok === false
    && blockerKinds(incompleteGovernedProtectedMutation).includes('PROTECTED_FILE_MUTATION'),
  JSON.stringify(incompleteGovernedProtectedMutation),
);

const directConsumerServedByGovernedProtectedMutation = classifyProtectedExtensionTopology({
  changedFiles: [{ path: 'src/core/engine.ts', additions: 3, deletions: 1, status: 'M' }],
  protectedPaths: ['src/core/engine.ts'],
  acceptanceEntrypoints: ['src/__tests__/engine.test.ts'],
  blockDirectProtectedAcceptanceConsumers: true,
  allowGovernedProtectedMutations: true,
  governedProtectedMutations: [{
    path: 'src/core/engine.ts',
    intent: 'serve required direct protected consumer under explicit override',
    validationPlan: ['typecheck', 'targeted-tests'],
    receipt: 'trace:op-governed-direct-consumer',
  }],
  fileTexts: {
    'src/core/engine.ts': 'export const changed = true;\n',
    'src/__tests__/engine.test.ts': "import { Engine } from '../core/engine.js';\n",
  },
});
check(
  'direct-protected-consumer-can-be-served-by-governed-protected-mutation',
  directConsumerServedByGovernedProtectedMutation.ok === true
    && warningKinds(directConsumerServedByGovernedProtectedMutation).includes('GOVERNED_PROTECTED_MUTATION_ALLOWED')
    && !blockerKinds(directConsumerServedByGovernedProtectedMutation).includes('DIRECT_PROTECTED_IMPORT_CONSUMER_UNSERVED'),
  JSON.stringify(directConsumerServedByGovernedProtectedMutation),
);

const protectedShadowFile = classifyProtectedExtensionTopology({
  changedFiles: [{ path: 'src/core/engine.js', additions: 8, deletions: 0, status: 'A' }],
  protectedPaths: ['src/core/engine.ts'],
  runtimeEntrypoints: ['src/public/index.ts'],
  fileTexts: { 'src/core/engine.js': 'export const shadow = true;\n' },
});
check(
  'blocks-same-stem-runtime-shadow-file-for-protected-path',
  protectedShadowFile.ok === false && blockerKinds(protectedShadowFile).includes('PROTECTED_SHADOW_FILE_ATTEMPT'),
  JSON.stringify(protectedShadowFile),
);

const protectedShadowSidecar = classifyProtectedExtensionTopology({
  changedFiles: [{ path: 'src/core/engine.generated.ts', additions: 8, deletions: 0, status: 'A' }],
  protectedPaths: ['src/core/engine.ts'],
  runtimeEntrypoints: ['src/public/index.ts'],
  fileTexts: { 'src/core/engine.generated.ts': 'export const generated = true;\n' },
});
check(
  'blocks-same-stem-sidecar-file-for-protected-path',
  protectedShadowSidecar.ok === false && blockerKinds(protectedShadowSidecar).includes('PROTECTED_SHADOW_FILE_ATTEMPT'),
  JSON.stringify(protectedShadowSidecar),
);

const protectedShadowHistory = classifyProtectedExtensionTopology({
  changedFiles: [],
  protectedPaths: ['src/core/engine.ts'],
  runtimeEntrypoints: ['src/public/index.ts'],
  operationHistory: [
    { tool: 'atomic_create_file', input: { file: 'src/core/engine.js' } },
    { tool: 'atomic_delete_file', input: { file: 'src/core/engine.js' } },
  ],
});
check(
  'blocks-deleted-operation-history-shadow-attempt',
  protectedShadowHistory.ok === false
    && blockerKinds(protectedShadowHistory).includes('PROTECTED_SHADOW_FILE_ATTEMPT')
    && JSON.stringify(protectedShadowHistory).includes('src/core/engine.js'),
  JSON.stringify(protectedShadowHistory),
);

const protectedShadowAllowed = classifyProtectedExtensionTopology({
  changedFiles: [{ path: 'src/core/engine.js', additions: 8, deletions: 0, status: 'A' }],
  protectedPaths: ['src/core/engine.ts'],
  runtimeEntrypoints: ['src/public/index.ts'],
  allowProtectedShadowFiles: true,
  fileTexts: { 'src/core/engine.js': 'export const shadow = true;\n' },
});
check(
  'protected-shadow-files-only-pass-with-explicit-warning',
  protectedShadowAllowed.ok === true && warningKinds(protectedShadowAllowed).includes('PROTECTED_SHADOW_FILE_ALLOWED'),
  JSON.stringify(protectedShadowAllowed),
);

const round031ShadowAttemptShape = classifyProtectedExtensionTopology({
  changedFiles: [
    { path: 'src/serializer/index.ts', additions: 1, deletions: 1, status: 'M' },
    { path: 'src/serializer/nullable-serde.ts', additions: 180, deletions: 0, status: 'A' },
  ],
  protectedPaths: ['src/serializer/binary.ts', 'src/serializer/types.ts'],
  runtimeEntrypoints: ['src/serializer/index.ts'],
  operationHistory: [{ tool: 'atomic_create_file', input: { file: 'src/serializer/binary.js' } }],
  fileTexts: {
    'src/serializer/index.ts': 'export { NullableBinarySerde as BinarySerde } from "./nullable-serde.js";\n',
    'src/serializer/nullable-serde.ts': 'export class NullableBinarySerde {}\n',
  },
});
check(
  'round031-shadow-attempt-shape-is-blocked-even-after-final-topology-is-clean',
  round031ShadowAttemptShape.ok === false
    && blockerKinds(round031ShadowAttemptShape).includes('PROTECTED_SHADOW_FILE_ATTEMPT'),
  JSON.stringify(round031ShadowAttemptShape),
);

const testMutation = classifyProtectedExtensionTopology({
  changedFiles: [{ path: 'src/__tests__/feature.test.ts', additions: 8, deletions: 0, status: 'M' }],
  protectedPaths: [],
  runtimeEntrypoints: ['src/public/index.ts'],
  testChangesAllowed: false,
  fileTexts: { 'src/__tests__/feature.test.ts': 'it("passes", () => {});\n' },
});
check(
  'blocks-test-change-when-policy-forbids-test-edits',
  testMutation.ok === false && blockerKinds(testMutation).includes('PROMPT_FORBIDDEN_TEST_CHANGE'),
  JSON.stringify(testMutation),
);

const allowedTestMutation = classifyProtectedExtensionTopology({
  changedFiles: [{ path: 'src/__tests__/feature.test.ts', additions: 8, deletions: 0, status: 'M' }],
  protectedPaths: [],
  runtimeEntrypoints: [],
  testChangesAllowed: true,
  fileTexts: { 'src/__tests__/feature.test.ts': 'it("passes", () => {});\n' },
});
check(
  'allows-test-change-only-under-explicit-policy-and-records-warning',
  allowedTestMutation.ok === true && warningKinds(allowedTestMutation).includes('TEST_CHANGE_ALLOWED'),
  JSON.stringify(allowedTestMutation),
);

const testOnlyPreload = classifyProtectedExtensionTopology({
  changedFiles: [
    { path: 'package.json', additions: 1, deletions: 1, status: 'M' },
    { path: 'src/runtime/patch.ts', additions: 5, deletions: 0, status: 'A' },
  ],
  protectedPaths: [],
  runtimeEntrypoints: ['src/public/index.ts'],
  requirePublicEntrypointWiring: true,
  fileTexts: {
    'package.json': '{"scripts":{"test":"node --import ./src/runtime/patch.ts --test"}}',
    'src/runtime/patch.ts': 'export const installed = true;\n',
    'src/public/index.ts': 'export { PublicApi } from "./api.js";\n',
  },
});
check(
  'blocks-test-only-command-preload-and-missing-public-wiring',
  testOnlyPreload.ok === false
    && blockerKinds(testOnlyPreload).includes('TEST_ONLY_PRELOAD')
    && blockerKinds(testOnlyPreload).includes('MISSING_PUBLIC_ENTRYPOINT_WIRING'),
  JSON.stringify(testOnlyPreload),
);

const allowedInfrastructurePreload = classifyProtectedExtensionTopology({
  changedFiles: [
    { path: 'package.json', additions: 1, deletions: 1, status: 'M' },
    { path: 'src/runtime/patch.ts', additions: 5, deletions: 0, status: 'A' },
  ],
  protectedPaths: [],
  runtimeEntrypoints: ['src/public/index.ts'],
  requirePublicEntrypointWiring: true,
  allowedPreloads: ['tsx/dist/loader.mjs'],
  fileTexts: {
    'package.json': '{"scripts":{"test":"node --import /opt/homebrew/lib/node_modules/tsx/dist/loader.mjs --import ./src/runtime/patch.ts --test"}}',
    'src/runtime/patch.ts': 'export const installed = true;\n',
    'src/public/index.ts': 'export { PublicApi } from "./api.js";\n',
  },
});
check(
  'allowed-infrastructure-preloads-do-not-mask-new-test-only-preloads',
  allowedInfrastructurePreload.ok === false
    && blockerKinds(allowedInfrastructurePreload).includes('TEST_ONLY_PRELOAD')
    && JSON.stringify(allowedInfrastructurePreload).includes('src/runtime/patch.ts')
    && !JSON.stringify(allowedInfrastructurePreload).includes('tsx/dist/loader.mjs'),
  JSON.stringify(allowedInfrastructurePreload),
);

const prototypePatch = classifyProtectedExtensionTopology({

  changedFiles: [{ path: 'src/runtime/patch.ts', additions: 5, deletions: 0, status: 'A' }],
  protectedPaths: [],
  runtimeEntrypoints: ['src/public/index.ts'],
  fileTexts: {
    'src/runtime/patch.ts': 'const proto = Service.prototype;\nproto.run = function run() { return true; };\n',
    'src/public/index.ts': 'import "../runtime/patch.js";\n',
  },
});
check(
  'blocks-prototype-monkey-patch-by-default',
  prototypePatch.ok === false && blockerKinds(prototypePatch).includes('PROTOTYPE_MONKEY_PATCH'),
  JSON.stringify(prototypePatch),
);

const prototypePatchAllowed = classifyProtectedExtensionTopology({
  changedFiles: [{ path: 'src/runtime/patch.ts', additions: 5, deletions: 0, status: 'A' }],
  protectedPaths: [],
  runtimeEntrypoints: ['src/public/index.ts'],
  allowPrototypeMonkeyPatch: true,
  fileTexts: {
    'src/runtime/patch.ts': 'const proto = Service.prototype;\nproto.run = function run() { return true; };\n',
    'src/public/index.ts': 'import "../runtime/patch.js";\n',
  },
});
check(
  'prototype-monkey-patch-can-only-be-warning-under-explicit-policy',
  prototypePatchAllowed.ok === true && warningKinds(prototypePatchAllowed).includes('PROTOTYPE_MONKEY_PATCH_ALLOWED'),
  JSON.stringify(prototypePatchAllowed),
);

const round029Shape = classifyProtectedExtensionTopology({
  changedFiles: [
    { path: 'package.json', additions: 1, deletions: 1, status: 'M' },
    { path: 'src/nullable-patch.ts', additions: 113, deletions: 0, status: 'A' },
    { path: 'src/serializer/field-schema-augment.ts', additions: 9, deletions: 0, status: 'A' },
    { path: 'src/__tests__/serializer.test.ts', additions: 42, deletions: 0, status: 'M' },
  ],
  protectedPaths: ['src/serializer/binary.ts', 'src/serializer/types.ts'],
  runtimeEntrypoints: ['src/serializer/index.ts'],
  requirePublicEntrypointWiring: true,
  testChangesAllowed: false,
  fileTexts: {
    'package.json': '{"scripts":{"test":"node --import ./src/nullable-patch.ts --test"}}',
    'src/nullable-patch.ts': 'const proto = BinarySerde.prototype as unknown as Record<string, unknown>;\nproto.serialize = function serialize() {};\n',
    'src/serializer/field-schema-augment.ts': 'declare module "./types.js" { interface FieldSchema { nullable?: boolean } }\n',
    'src/serializer/index.ts': 'export { BinarySerde } from "./binary.js";\n',
    'src/__tests__/serializer.test.ts': 'describe("new behavior", () => {});\n',
  },
});
check(
  'round029-shape-is-not-honest-product-green',
  round029Shape.ok === false
    && blockerKinds(round029Shape).includes('PROMPT_FORBIDDEN_TEST_CHANGE')
    && blockerKinds(round029Shape).includes('TEST_ONLY_PRELOAD')
    && blockerKinds(round029Shape).includes('PROTOTYPE_MONKEY_PATCH')
    && blockerKinds(round029Shape).includes('MISSING_PUBLIC_ENTRYPOINT_WIRING'),
  JSON.stringify(round029Shape),
);

const cli = runCli(['--classify-protected-extension-topology'], JSON.stringify({
  changedFiles: [],
  protectedPaths: [],
  runtimeEntrypoints: [],
}));
check('runCli-classifies-protected-extension-topology', cli.ok === true, JSON.stringify(cli));

const failed = checks.filter((c) => !c.ok);
const result = {
  ok: failed.length === 0,
  gate: 'protected-extension-topology',
  checks,
  failedCount: failed.length,
  honestCeiling: 'Pure topology classifier only. It uses supplied changed-file metadata and supplied file text; it does not inspect git, prove behavioral correctness, or decide whether protected policy itself is valid.',
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.ok ? 0 : 1);
