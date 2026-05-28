/**
 * @deprecated Use {@link ./mind/coordination/mind-commercial-graph.service.ts MindCommercialGraph}.
 *
 * Legacy import path kept as a re-export shim for the ADR-0013 Wave M1 alias
 * window (4 weeks). The canonical implementation now lives at
 * `backend/src/kloel/mind/coordination/mind-commercial-graph.service.ts`.
 *
 * @cluster Mind/Coordination
 * @canonical backend/src/kloel/mind/coordination/mind-commercial-graph.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  MindCommercialGraph,
  /** @deprecated Use {@link MindCommercialGraph} instead. */
  BrainCommercialGraphService,
} from './mind/coordination/mind-commercial-graph.service';
