// PULSE — Live Codebase Nervous System
// Structural graph and codacy evidence types

import type { PulseConvergenceOwnerLane } from './types.gate-failure';

/** Pulse truth mode type. */
export type PulseTruthMode = 'observed' | 'inferred' | 'aspirational';

/** Pulse structural role type. */
export type PulseStructuralRole =
  | 'interface'
  | 'orchestration'
  | 'persistence'
  | 'side_effect'
  | 'simulation';

/** Pulse structural node kind type. */
export type PulseStructuralNodeKind =
  | 'ui_element'
  | 'api_call'
  | 'proxy_route'
  | 'backend_route'
  | 'service_trace'
  | 'persistence_model'
  | 'side_effect_signal'
  | 'facade'
  | 'evidence';

/** Pulse structural edge kind type. */
export type PulseStructuralEdgeKind =
  | 'calls'
  | 'routes_to'
  | 'proxies_to'
  | 'orchestrates'
  | 'persists'
  | 'emits'
  | 'simulates'
  | 'observes'
  | 'co_located';

/** Pulse structural node shape. */
export interface PulseStructuralNode {
  /** Id property. */
  id: string;
  /** Kind property. */
  kind: PulseStructuralNodeKind;
  /** Role property. */
  role: PulseStructuralRole;
  /** Truth mode property. */
  truthMode: PulseTruthMode;
  /** Adapter property. */
  adapter: string;
  /** Label property. */
  label: string;
  /** File property. */
  file: string;
  /** Line property. */
  line: number;
  /** User facing property. */
  userFacing: boolean;
  /** Runtime critical property. */
  runtimeCritical: boolean;
  /** Protected by governance property. */
  protectedByGovernance: boolean;
  /** Metadata property. */
  metadata: Record<string, string | number | boolean | string[] | null>;
  /** Whether the file backing this node has been indexed by GitNexus. */
  gitnexusIndexed?: boolean;
  /** Whether GitNexus impact data is available for this node's file. */
  gitnexusImpactKnown?: boolean;
  /** Risk level from GitNexus impact analysis for this node's file. */
  gitnexusRisk?: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  /** GitNexus-related warnings for this node's file. */
  gitnexusWarnings?: string[];
}

/** Pulse structural edge shape. */
export interface PulseStructuralEdge {
  /** Id property. */
  id: string;
  /** From property. */
  from: string;
  /** To property. */
  to: string;
  /** Kind property. */
  kind: PulseStructuralEdgeKind;
  /** Truth mode property. */
  truthMode: PulseTruthMode;
  /** Evidence property. */
  evidence: string;
}

/** Pulse structural graph summary shape. */
export interface PulseStructuralGraphSummary {
  /** Total nodes property. */
  totalNodes: number;
  /** Total edges property. */
  totalEdges: number;
  /** Role counts property. */
  roleCounts: Record<PulseStructuralRole, number>;
  /** Interface chains property. */
  interfaceChains: number;
  /** Complete chains property. */
  completeChains: number;
  /** Partial chains property. */
  partialChains: number;
  /** Simulated chains property. */
  simulatedChains: number;
}

/** Pulse structural graph shape. */
export interface PulseStructuralGraph {
  /** Generated at property. */
  generatedAt: string;
  /** Summary property. */
  summary: PulseStructuralGraphSummary;
  /** Nodes property. */
  nodes: PulseStructuralNode[];
  /** Edges property. */
  edges: PulseStructuralEdge[];
}

/** Pulse codacy evidence hotspot shape. */
export interface PulseCodacyEvidenceHotspot {
  /** File path property. */
  filePath: string;
  /** Issue count property. */
  issueCount: number;
  /** High severity count property. */
  highSeverityCount: number;
  /** Categories property. */
  categories: string[];
  /** Tools property. */
  tools: string[];
  /** Owner lane property. */
  ownerLane: PulseConvergenceOwnerLane;
  /** Runtime critical property. */
  runtimeCritical: boolean;
  /** User facing property. */
  userFacing: boolean;
  /** Protected by governance property. */
  protectedByGovernance: boolean;
}

/** Pulse codacy evidence summary shape. */
export interface PulseCodacyEvidenceSummary {
  /** Snapshot available property. */
  snapshotAvailable: boolean;
  /** Stale property. */
  stale: boolean;
  /** Total issues property. */
  totalIssues: number;
  /** High issues property. */
  highIssues: number;
  /** Runtime critical hotspots property. */
  runtimeCriticalHotspots: number;
  /** User facing hotspots property. */
  userFacingHotspots: number;
  /** Human required hotspots property. */
  humanRequiredHotspots: number;
}

/** Pulse codacy evidence shape. */
export interface PulseCodacyEvidence {
  /** Generated at property. */
  generatedAt: string;
  /** Summary property. */
  summary: PulseCodacyEvidenceSummary;
  /** Hotspots property. */
  hotspots: PulseCodacyEvidenceHotspot[];
}

/** Pulse shell complexity type. */
export type PulseShellComplexity = 'light' | 'medium' | 'rich';
