/**
 * Pulse artifact generation — thin orchestrator shell.
 * Implementation in __parts__/artifacts/
 */
export { PulseArtifactSnapshot, PulseArtifactPaths } from './__parts__/artifacts/types';
export type { PulseArtifactRegistry } from './__parts__/artifacts/types';
export { generateArtifacts } from './__parts__/artifacts/generate';
