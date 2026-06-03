// PULSE — Live Codebase Nervous System
// Universal Plugin Architecture types (Wave 9)

/**
 * Classification of a PULSE plugin module.
 *
 * - `parser`: parses external tool output into structured evidence
 * - `adapter`: connects to external services (GitHub, Codacy, Sentry, etc.)
 * - `evidence_provider`: directly produces evidence artifacts
 * - `gate_provider`: contributes certification gate logic
 * - `executor`: participates in PULSE execution pipeline
 * - `domain_pack`: bundles capability seeds, flow groups, and structural
 *   patterns for a specific domain
 */
export type PluginKind =
  | 'parser'
  | 'adapter'
  | 'evidence_provider'
  | 'gate_provider'
  | 'executor'
  | 'domain_pack';

/**
 * A plugin that extends PULSE with additional capabilities.
 *
 * Plugins are self-describing modules that can be discovered, loaded,
 * and composed at runtime to extend PULSE's analysis surface.
 */
export interface PulsePlugin {
  /** Unique plugin identifier. */
  id: string;
  /** The kind of plugin. */
  kind: PluginKind;
  /** Semantic version of the plugin. */
  version: string;
  /** Discover the nodes this plugin contributes to the structural graph. */
  discover(): PulsePluginNode[];
  /** Define relationships (edges) between nodes contributed by loaded plugins. */
  link(nodes: PulsePluginNode[]): PulsePluginEdge[];
  /** Produce evidence artifacts from this plugin. */
  evidence(): PulsePluginEvidence[];
  /** Contribute certification gates to the evaluation pipeline. */
  gates(): PulsePluginGate[];
}

/** A node contributed by a plugin to the PULSE structural graph. */
export interface PulsePluginNode {
  /** Unique node identifier. */
  id: string;
  /** Node kind (e.g. 'module', 'service', 'api_route', 'db_table'). */
  kind: string;
  /** Human-readable label for the node. */
  label: string;
  /** Arbitrary metadata attached to the node. */
  metadata: Record<string, unknown>;
}

/** An edge between two plugin nodes in the structural graph. */
export interface PulsePluginEdge {
  /** Unique edge identifier. */
  id: string;
  /** Source node id. */
  from: string;
  /** Target node id. */
  to: string;
  /** Edge kind (e.g. 'calls', 'depends_on', 'reads_from'). */
  kind: string;
  /** Arbitrary metadata attached to the edge. */
  metadata: Record<string, unknown>;
}

/** An evidence artifact produced by a plugin. */
export interface PulsePluginEvidence {
  /** Unique evidence identifier. */
  id: string;
  /** Evidence type classification. */
  type: string;
  /** The evidence value (can be any shape). */
  value: unknown;
  /** Confidence in the evidence (0–1). */
  confidence: number;
}

/** A certification gate contributed by a plugin. */
export interface PulsePluginGate {
  /** Unique gate identifier. */
  id: string;
  /** Human-readable gate name. */
  name: string;
  /** Whether this gate passes. */
  passed: boolean;
  /** Reason for pass or failure. */
  reason: string;
}

/**
 * Snapshot of the loaded PULSE plugin registry.
 */
export interface PluginRegistry {
  /** ISO-8601 timestamp of when the registry was generated. */
  generatedAt: string;
  /** Individual plugin load results. */
  plugins: Array<{
    id: string;
    kind: PluginKind;
    loaded: boolean;
    error: string | null;
    entrypoint: string;
    sourceMtime: string | null;
    proof: string;
  }>;
  /** Discovery health and freshness proof for the plugin surface. */
  health: {
    status: 'pass' | 'partial' | 'missing';
    generatedAt: string;
    discoveredAt: string;
    freshnessMinutes: number;
    proof: string;
  };
  /** Aggregate counts across the registry. */
  summary: {
    total: number;
    loaded: number;
    failed: number;
  };
}
