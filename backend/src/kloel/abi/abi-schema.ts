/**
 * UTP-ABI-001 — Cognitive State ABI schema (TypeScript mirror of PCI.2).
 *
 * Implements PCI.2 §3 (docs/contracts/pci/02-abi-schema.md).
 *
 * THIS IS THE ONLY MESSAGE THE LLM RECEIVES. There is no `role: 'system'`
 * instructional payload. B1 + B2 are law.
 *
 * Schema additions are MINOR bumps; semantic changes are MAJOR + ADR.
 * The `abiVersion` field below is the source of truth for what consumers
 * compare against. UTP-ABI-003 enforces version policy in CI.
 */

export const ABI_VERSION = '1.0.0' as const;

/**
 * The single canonical mirror of PCI.5 truth modes.
 */
export type AbiTruthMode = 'observed' | 'inferred' | 'projected';

/**
 * Audience reflects PCI.5 §4. Default in any commercial channel is `public`.
 */
export type AbiAudience = 'public' | 'technical' | 'origin' | 'internal';

/**
 * Capability maturity reflects D.7 promotion ladder.
 */
export type AbiCapabilityMaturity = 'developing' | 'operational' | 'productionReady';

/**
 * Valence per PCI.5 §3.
 */
export type AbiValence = 'positive' | 'negative' | 'neutral' | 'ambiguous';

/**
 * Lineage status as seen by the consumer (mirrors PCI.3).
 */
type AbiLineageStatus = 'intact' | 'compromised';

// ---------------------------------------------------------------------------
// 3.2 lineage
// ---------------------------------------------------------------------------
interface AbiLineage {
  readonly canonicalName: 'Kloel';
  readonly genesisEventId: string;
  readonly lineageStatus: AbiLineageStatus;
  readonly operationalAge: {
    readonly sinceGenesisDays: number;
    readonly sinceFirstWorkspaceDays: number;
  };
  readonly capabilities: readonly string[];
}

// ---------------------------------------------------------------------------
// 3.3 identityProjection
// ---------------------------------------------------------------------------
interface AbiIdentityProjection {
  readonly audience: AbiAudience;
  readonly currentMaturity: AbiCapabilityMaturity;
  readonly truthMode: AbiTruthMode;
}

// ---------------------------------------------------------------------------
// 3.4 perception
// ---------------------------------------------------------------------------
interface AbiSalientEvent {
  readonly eventId: string;
  readonly eventName: string;
  readonly occurredAt: string;
  readonly summary: string;
  readonly valence?: AbiValence;
}

export interface AbiPerceptionSnapshot {
  readonly channel: string;
  readonly workspaceId?: string;
  readonly conversationRef?: { readonly entityType: 'conversation'; readonly entityId: string };
  readonly leadRef?: { readonly entityType: 'lead'; readonly entityId: string };
  readonly activeStage?: string;
}

interface AbiPerception {
  readonly currentSnapshot: AbiPerceptionSnapshot;
  readonly recentSalientEvents: readonly AbiSalientEvent[];
}

// ---------------------------------------------------------------------------
// 3.5 beliefs
// ---------------------------------------------------------------------------
interface AbiBelief {
  readonly beliefId: string;
  readonly subject: string;
  readonly proposition: string;
  readonly confidence: number;
  readonly evidenceCount: number;
  readonly lastUpdated: string;
  readonly truthMode: AbiTruthMode;
}

// ---------------------------------------------------------------------------
// 3.6 predictions
// ---------------------------------------------------------------------------
interface AbiActivePrediction {
  readonly predictionId: string;
  readonly about: string;
  readonly expectedOutcome: string;
  readonly confidence: number;
  readonly horizonHours: number;
}

interface AbiSurprise {
  readonly predictionId: string;
  readonly expected: string;
  readonly observed: string;
  readonly surpriseMagnitude: number;
  readonly occurredAt: string;
}

interface AbiPredictions {
  readonly active: readonly AbiActivePrediction[];
  readonly recentSurprises: readonly AbiSurprise[];
}

// ---------------------------------------------------------------------------
// 3.7 attention
// ---------------------------------------------------------------------------
interface AbiAttentionFocal {
  readonly targetType: string;
  readonly targetId: string;
  readonly reason: string;
  readonly sinceMs: number;
}

export interface AbiAttentionCandidate {
  readonly targetType: string;
  readonly targetId: string;
  readonly weight: number;
}

export interface AbiAttention {
  readonly focal?: AbiAttentionFocal;
  readonly candidates: readonly AbiAttentionCandidate[];
}

// ---------------------------------------------------------------------------
// 3.8 memory
// ---------------------------------------------------------------------------
interface AbiWorkingMemoryItem {
  readonly itemId: string;
  readonly kind: 'fact' | 'intent' | 'constraint' | 'open_question';
  readonly content: string;
  readonly addedAt: string;
}

interface AbiEpisodicRef {
  readonly episodeId: string;
  readonly summary: string;
  readonly valence?: AbiValence;
  readonly occurredAt: string;
}

interface AbiConsolidatedRef {
  readonly skillId: string;
  readonly summary: string;
  readonly consolidatedAt: string;
}

interface AbiMemory {
  readonly workingMemory: readonly AbiWorkingMemoryItem[];
  readonly episodicRefs: readonly AbiEpisodicRef[];
  readonly consolidatedRefs: readonly AbiConsolidatedRef[];
}

// ---------------------------------------------------------------------------
// 3.9 capabilities
// ---------------------------------------------------------------------------
interface AbiAvailableCapability {
  readonly capabilityId: string;
  readonly maturity: AbiCapabilityMaturity;
  readonly runtimeEvidencePct: number;
}

interface AbiRestrictedCapability {
  readonly capabilityId: string;
  readonly reason: string;
  readonly restrictedAt: string;
}

interface AbiCapabilities {
  readonly available: readonly AbiAvailableCapability[];
  readonly restricted: readonly AbiRestrictedCapability[];
}

// ---------------------------------------------------------------------------
// 3.10 valence
// ---------------------------------------------------------------------------
export interface AbiValenceTrace {
  readonly eventId: string;
  readonly valence: AbiValence;
  readonly weight: number;
  readonly occurredAt: string;
}

export interface AbiAggregatedMood {
  readonly positive: number;
  readonly negative: number;
  readonly neutral: number;
  readonly ambiguous: number;
  readonly windowHours: number;
}

interface AbiValenceSection {
  readonly recentTrace: readonly AbiValenceTrace[];
  readonly aggregatedMood: AbiAggregatedMood;
}

// ---------------------------------------------------------------------------
// 3.11 pulseTruth
// ---------------------------------------------------------------------------
interface AbiPulseGateSnapshot {
  readonly gateName: string;
  readonly status: 'PASS' | 'FAIL';
  readonly mode: 'log_only' | 'hard_fail';
  readonly lastChecked: string;
}

interface AbiCertificationVerdict {
  readonly verdict: 'SIM' | 'NAO' | 'INSUFFICIENT_EVIDENCE';
  readonly score: number;
  readonly measuredAt: string;
}

export interface AbiPulseTruth {
  readonly noOverclaimStatus: 'PASS' | 'WARN' | 'FAIL';
  readonly capabilityHealthScore: number;
  readonly gates: readonly AbiPulseGateSnapshot[];
  readonly certificationVerdict: AbiCertificationVerdict;
  readonly overclaimRisk: number;
}

// ---------------------------------------------------------------------------
// 3.12 workspaceLocalProfile (Camada V — optional until enough volume)
// ---------------------------------------------------------------------------
export interface AbiWorkspaceLocalProfile {
  readonly workspaceId: string;
  readonly operational: Readonly<Record<string, unknown>>;
  readonly language: { readonly tone: string; readonly vocabulary: readonly string[] };
  readonly product: {
    readonly catalog: readonly { readonly productId: string; readonly role: string }[];
  };
  readonly customer: { readonly typicalProfile: Readonly<Record<string, unknown>> };
  readonly temporal: {
    readonly peakHours: readonly number[];
    readonly typicalCycleHours: number;
  };
  readonly decisionPatterns: {
    readonly typicalNextSteps: readonly string[];
    readonly typicalEscalations: readonly string[];
  };
  readonly derivedFromEventsCount: number;
  readonly derivedAt: string;
}

// ---------------------------------------------------------------------------
// 3.13 wisdomContext (Camada VI — optional)
// ---------------------------------------------------------------------------
export interface AbiWisdomPattern {
  readonly patternId: string;
  readonly description: string;
  readonly applicableConditions: readonly string[];
  readonly evidenceWorkspacesCount: number;
  readonly confidence: number;
}

// ---------------------------------------------------------------------------
// 3.14 roleContext (Camada XXIII — optional)
// ---------------------------------------------------------------------------
export interface AbiRoleDetection {
  readonly role:
    | 'produtor'
    | 'afiliado'
    | 'agencia'
    | 'gestor'
    | 'closer'
    | 'creator'
    | 'especialista';
  readonly confidence: number;
  readonly detectedFromSignals: readonly string[];
}

export interface AbiRoleContext {
  readonly detectedRoles: readonly AbiRoleDetection[];
  readonly primaryRole?: AbiRoleDetection['role'];
  readonly realLevers: readonly string[];
  readonly relevantMetrics: readonly {
    readonly metricName: string;
    readonly currentValue: number | string;
  }[];
}

// ---------------------------------------------------------------------------
// 3.15 currentInput
// ---------------------------------------------------------------------------
interface AbiInputParsed {
  readonly intent?: string;
  readonly entities?: readonly { readonly type: string; readonly value: string }[];
  readonly sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
  readonly objection?: { readonly kind: string; readonly confidence: number };
}

export interface AbiCurrentInput {
  readonly raw: string;
  readonly parsed?: AbiInputParsed;
  readonly channel: string;
  readonly arrivalTimestamp: string;
}

// ---------------------------------------------------------------------------
// Top-level ABI payload
// ---------------------------------------------------------------------------
export interface CognitiveStateAbi {
  readonly abiVersion: string;
  readonly lineage: AbiLineage;
  readonly identityProjection: AbiIdentityProjection;
  readonly perception: AbiPerception;
  readonly beliefs: readonly AbiBelief[];
  readonly predictions: AbiPredictions;
  readonly attention: AbiAttention;
  readonly memory: AbiMemory;
  readonly capabilities: AbiCapabilities;
  readonly valence: AbiValenceSection;
  readonly pulseTruth: AbiPulseTruth;
  readonly workspaceLocalProfile?: AbiWorkspaceLocalProfile;
  readonly wisdomContext?: readonly AbiWisdomPattern[];
  readonly roleContext?: AbiRoleContext;
  readonly currentInput: AbiCurrentInput;
}

/**
 * Required (non-optional) top-level keys. Used by the validator.
 */
export const ABI_REQUIRED_KEYS = [
  'abiVersion',
  'lineage',
  'identityProjection',
  'perception',
  'beliefs',
  'predictions',
  'attention',
  'memory',
  'capabilities',
  'valence',
  'pulseTruth',
  'currentInput',
] as const;
