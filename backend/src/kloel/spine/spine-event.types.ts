/**
 * Spine event canonical envelope — used by every emitter (PCI.6 surfaces)
 * and by every consumer (MIND, GOAL, LOCAL-IDENT, INSIGHT, etc.).
 *
 * Mirrors PCI.1 §4 (universal required fields) and re-uses the in-process
 * SpineEventRef shape from MIND for downstream consumption.
 */
import type { AbiTruthMode, AbiValence } from '../abi/abi-schema';

export interface SpineEventInput {
  readonly eventName: string;
  readonly workspaceId?: string;
  readonly entityRef?: { readonly entityType: string; readonly entityId: string };
  readonly truthMode: AbiTruthMode;
  readonly provenance: {
    readonly source: 'synthetic' | 'production';
    readonly processor: string;
    readonly processorVersion: string;
    readonly schemaVersion: string;
  };
  readonly valence?: AbiValence;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly causedBy?: readonly string[];
  readonly correlationId?: string;
  readonly occurredAt?: string;
}

export interface SpineEventEnvelope {
  readonly eventId: string;
  readonly eventName: string;
  readonly timestamp: string;
  readonly occurredAt: string;
  readonly workspaceId?: string;
  readonly entityRef?: { readonly entityType: string; readonly entityId: string };
  readonly truthMode: AbiTruthMode;
  readonly provenance: SpineEventInput['provenance'] & {
    readonly environment: 'dev' | 'staging' | 'prod';
  };
  readonly valence?: AbiValence;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly causedBy?: readonly string[];
  readonly correlationId?: string;
}
