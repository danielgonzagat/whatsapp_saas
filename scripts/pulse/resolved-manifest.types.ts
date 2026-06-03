import type { PulseResolvedFlowKind } from './types.resolved-manifest';

export interface SemanticFlowDescriptor {
  id: string;
  canonicalName: string;
  flowKind: PulseResolvedFlowKind;
  aliases: string[];
}
