/**
 * Pulse artifact generation — thin orchestrator shell.
 * Implementation in artifacts/
 *
 * Contains writeRegisteredArtifact() calls for AST-based artifact registry
 * discovery (scanned by artifact-registry/discovery.ts).
 * This file is never imported at runtime — it exists purely for the
 * TypeScript AST scanner to discover artifact IDs.
 */
export { PulseArtifactSnapshot, PulseArtifactPaths } from './artifacts/types';
export type { PulseArtifactRegistry } from './artifacts/types';
export { generateArtifacts } from './artifacts/generate';

import type { PulseArtifactRegistry } from './artifact-registry/discovery';

declare function writeRegisteredArtifact(
  registry: PulseArtifactRegistry,
  id: string,
  content: unknown,
): string;

// AST discovery stubs — never executed, parsed only by TypeScript AST scanner.
// Each call registers an artifact ID in the PulseArtifactRegistry.
// Keep in sync with artifacts/generate.ts writeRegisteredArtifact() calls.

function __artifact_registry_discovery_stubs__(registry: PulseArtifactRegistry): void {
  writeRegisteredArtifact(registry, 'report', '');
  writeRegisteredArtifact(registry, 'certificate', '');
  writeRegisteredArtifact(registry, 'machine-readiness', '');
  writeRegisteredArtifact(registry, 'directive', '');
  writeRegisteredArtifact(registry, 'gitnexus-state', '');
  writeRegisteredArtifact(registry, 'beads-state', '');
  writeRegisteredArtifact(registry, 'context-broadcast', '');
  writeRegisteredArtifact(registry, 'worker-leases', '');
  writeRegisteredArtifact(registry, 'context-delta', '');
  writeRegisteredArtifact(registry, 'autonomy-proof', '');
  writeRegisteredArtifact(registry, 'artifact-index', '');
  writeRegisteredArtifact(registry, 'health', '');
  writeRegisteredArtifact(registry, 'scope-state', '');
  writeRegisteredArtifact(registry, 'codacy-evidence', '');
  writeRegisteredArtifact(registry, 'structural-graph', '');
  writeRegisteredArtifact(registry, 'execution-chains', '');
  writeRegisteredArtifact(registry, 'execution-matrix', '');
  writeRegisteredArtifact(registry, 'product-graph', '');
  writeRegisteredArtifact(registry, 'capability-state', '');
  writeRegisteredArtifact(registry, 'flow-projection', '');
  writeRegisteredArtifact(registry, 'parity-gaps', '');
  writeRegisteredArtifact(registry, 'external-signal-state', '');
  writeRegisteredArtifact(registry, 'product-vision', '');
  writeRegisteredArtifact(registry, 'convergence-plan', '');
  writeRegisteredArtifact(registry, 'finding-validation-state', '');
  writeRegisteredArtifact(registry, 'no-hardcoded-reality-state', '');
  writeRegisteredArtifact(registry, 'autonomy-state', '');
  writeRegisteredArtifact(registry, 'autonomy-memory', '');
  writeRegisteredArtifact(registry, 'agent-orchestration-state', '');
  writeRegisteredArtifact(registry, 'runtime-evidence', '');
  writeRegisteredArtifact(registry, 'runtime-probes', '');
  writeRegisteredArtifact(registry, 'browser-evidence', '');
  writeRegisteredArtifact(registry, 'flow-evidence', '');
  writeRegisteredArtifact(registry, 'invariant-evidence', '');
  writeRegisteredArtifact(registry, 'observability-evidence', '');
  writeRegisteredArtifact(registry, 'recovery-evidence', '');
  writeRegisteredArtifact(registry, 'customer-evidence', '');
  writeRegisteredArtifact(registry, 'operator-evidence', '');
  writeRegisteredArtifact(registry, 'admin-evidence', '');
  writeRegisteredArtifact(registry, 'soak-evidence', '');
  writeRegisteredArtifact(registry, 'scenario-coverage', '');
  writeRegisteredArtifact(registry, 'world-state', '');
  writeRegisteredArtifact(registry, 'execution-trace', '');
  writeRegisteredArtifact(registry, 'codebase-truth', '');
  writeRegisteredArtifact(registry, 'resolved-manifest', '');
}

void __artifact_registry_discovery_stubs__;
