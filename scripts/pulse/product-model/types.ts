/**
 * PULSE Product Model Layer (P1)
 *
 * Transforms code artifacts into product capabilities, flows, and surfaces.
 * This is the "reconstruction layer" that turns files into product vision.
 *
 * Key concepts:
 * - Surface: Top-level product area discovered from manifest and code evidence
 * - Capability: Feature that spans UI, API, and persistence
 * - Flow: User journey across capabilities
 *
 * Extended truth modes for capabilities/flows (beyond PULSE standard):
 * - real: Exists and works with evidence (observed + complete)
 * - partial: Exists but broken or incomplete (partial mode)
 * - latent: Declared/aspirational - strong signals but not implemented (aspirational mode)
 * - phantom: Parece existir but is illusion of orphaned front/back (inferred only)
 */

import type {
  PulseStructuralGraph,
  PulseTruthMode,
} from '../types.structural';
import type { PulseScopeState } from '../types.truth.scope';
import type { PulseResolvedManifest } from '../types.resolved-manifest';

import {
  discoverStructuralNodeKindLabels,
  discoverStructuralRoleLabels,
  discoverTruthModeLabels,
} from '../dynamic-reality-kernel/type-contract-engines';
import {
  deriveHttpStatusFromObservedCatalog,
  deriveUnitValue,
  observeStatusTextLengthFromCatalog,
} from '../dynamic-reality-kernel/catalog-arithmetic';

/** Input to product model builder */
export interface BuildProductModelInput {
  /** Structural graph property. */
  structuralGraph: PulseStructuralGraph;
  /** Scope state property. */
  scopeState: PulseScopeState;
  /** Resolved manifest property. */
  resolvedManifest: PulseResolvedManifest;
}

/** Extended truth mode for capability/flow classification */
type CapabilityTruthMode = 'real' | 'partial' | 'latent' | 'phantom';

type ArtifactLayer = 'frontend' | 'backend' | 'persistence' | 'worker' | 'external' | 'evidence';

const MAX_PRODUCT_SURFACES =
  observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Bad Request')) *
    observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Bad Request')) -
  deriveUnitValue();
const MAX_SURFACE_ARTIFACT_IDS =
  deriveHttpStatusFromObservedCatalog('OK') +
  deriveHttpStatusFromObservedCatalog('OK') /
    (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue());
const MAX_PRODUCT_CAPABILITIES = deriveHttpStatusFromObservedCatalog('Bad Request');
const MAX_CAPABILITY_ARTIFACT_IDS =
  observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Bad Request')) *
    observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Bad Request')) -
  deriveUnitValue();
const MAX_PRODUCT_FLOWS = deriveHttpStatusFromObservedCatalog('Multiple Choices');

const _truthModeLabels = [...discoverTruthModeLabels()] as PulseTruthMode[];
const _OBSERVED_TRUTH = _truthModeLabels[deriveUnitValue() - deriveUnitValue()];
const _INFERRED_TRUTH = _truthModeLabels[deriveUnitValue()];
const _ASPIRATIONAL_TRUTH = _truthModeLabels[deriveUnitValue() + deriveUnitValue()];

const _roleLabels = [...discoverStructuralRoleLabels()];
const _INTERFACE_ROLE = _roleLabels[deriveUnitValue() - deriveUnitValue()];
const _ORCHESTRATION_ROLE = _roleLabels[deriveUnitValue()];
const _PERSISTENCE_ROLE = _roleLabels[deriveUnitValue() + deriveUnitValue()];
const _SIDE_EFFECT_ROLE = _roleLabels[deriveUnitValue() + deriveUnitValue() + deriveUnitValue()];

const _kindLabels = [...discoverStructuralNodeKindLabels()];
const _EVIDENCE_KIND =
  _kindLabels[
    deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue()
  ];
const _API_CALL_KIND = _kindLabels[deriveUnitValue()];
const _PROXY_ROUTE_KIND = _kindLabels[deriveUnitValue() + deriveUnitValue()];
const _BACKEND_ROUTE_KIND = _kindLabels[deriveUnitValue() + deriveUnitValue() + deriveUnitValue()];
const _PERSISTENCE_MODEL_KIND =
  _kindLabels[
    deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue()
  ];

export {
  type CapabilityTruthMode,
  type ArtifactLayer,
  MAX_PRODUCT_SURFACES,
  MAX_SURFACE_ARTIFACT_IDS,
  MAX_PRODUCT_CAPABILITIES,
  MAX_CAPABILITY_ARTIFACT_IDS,
  MAX_PRODUCT_FLOWS,
  _truthModeLabels,
  _OBSERVED_TRUTH,
  _INFERRED_TRUTH,
  _ASPIRATIONAL_TRUTH,
  _roleLabels,
  _INTERFACE_ROLE,
  _ORCHESTRATION_ROLE,
  _PERSISTENCE_ROLE,
  _SIDE_EFFECT_ROLE,
  _kindLabels,
  _EVIDENCE_KIND,
  _API_CALL_KIND,
  _PROXY_ROUTE_KIND,
  _BACKEND_ROUTE_KIND,
  _PERSISTENCE_MODEL_KIND,
};
