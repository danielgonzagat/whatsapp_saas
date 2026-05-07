/** A single divergence found between two or more artifacts. */
export interface ArtifactDivergence {
  /** The field name where values differ. */
  field: string;
  /** Mapping of artifact file → value found at that field. */
  values: Record<string, unknown>;
  /** Artifact source file paths that contributed conflicting values. */
  sources: string[];
}

/** Result of the cross-artifact consistency check. */
export interface ConsistencyResult {
  /** True when no divergences were found. */
  pass: boolean;
  /** All divergences found. */
  divergences: ArtifactDivergence[];
  /** Artifacts that could not be loaded (missing or invalid JSON). */
  missingArtifacts: string[];
}

/** A loaded artifact with its resolved path. */
export interface LoadedArtifact {
  filePath: string;
  data: Record<string, unknown>;
}
