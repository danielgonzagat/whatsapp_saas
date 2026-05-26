/**
 * MindCommercialGraph — canonical name for the commercial knowledge graph service
 * (ADR-0013 Wave M1).
 *
 * Legacy implementation: `backend/src/kloel/brain-commercial-graph.service.ts`.
 *
 * @cluster Mind/Coordination
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  BrainCommercialGraphService as MindCommercialGraph,
  /** @deprecated Use {@link MindCommercialGraph} instead. */
  BrainCommercialGraphService,
} from '../../brain-commercial-graph.service';
