// Pure type definitions for the CIA API. Split into focused modules so each
// file stays under the 400-LOC governance gate; this file remains the public
// barrel so every prior consumer that imports from '@/lib/api/cia.types' (or
// transitively via '@/lib/api/cia') continues to compile unchanged.
//
// Module layout:
//   - cia.types.signals.ts  -> market signal + insight shapes
//   - cia.types.surface.ts  -> surface response + cognitive highlight + human task
//   - cia.types.runtime.ts  -> approval / input session / work item / runtime / capability registry
//   - cia.types.proofs.ts   -> account + conversation proof shapes

export type { CiaInsight, CiaMarketSignal } from './cia.types.signals';

export type {
  CiaCognitiveHighlight,
  CiaHumanTask,
  CiaSurfaceResponse,
} from './cia.types.surface';

export type {
  CiaAccountApproval,
  CiaAccountRuntime,
  CiaCapabilityRegistry,
  CiaCapabilityRegistryItem,
  CiaConversationActionRegistry,
  CiaInputSession,
  CiaWorkItem,
} from './cia.types.runtime';

export type { CiaConversationProof, CiaProof } from './cia.types.proofs';
