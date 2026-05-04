/**
 * PULSE Contract Testing & Schema Diff Engine — Type Definitions
 *
 * Defines the type surface for provider contract validation, API schema
 * diffing against structural snapshots, and Prisma migration safety checks.
 */

/** External service provider id discovered from observed URL hosts. */
export type ContractProvider = string;

/** Current validation status of a provider contract. */
export type ContractStatus =
  | 'valid'
  | 'broken'
  | 'untested'
  | 'deprecated'
  | 'unknown'
  | 'generated';

/** Severity classification for a detected schema change. */
export type SchemaDiffSeverity = 'breaking' | 'non_breaking' | 'addition' | 'deprecation';

/**
 * Represents the expected API contract for a single external provider endpoint.
 * Includes the request/response shape, authentication requirements, and
 * accumulated issues detected during validation.
 */
export interface ProviderContract {
  /** Which external provider this contract belongs to. */
  provider: ContractProvider;

  /** The endpoint URL pattern (e.g. "/v1/chat/completions"). */
  endpoint: string;

  /** HTTP method used (GET, POST, PUT, DELETE, etc.). */
  method: string;

  /** Expected shape of the request body or query parameters. */
  expectedRequestSchema: Record<string, unknown>;

  /** Expected shape of the response body. */
  expectedResponseSchema: Record<string, unknown>;

  /** HTTP headers expected to be present in the request or response. */
  expectedHeaders: string[];

  /** Authentication mechanism required by this endpoint. */
  authType: 'api_key' | 'bearer' | 'webhook_signature' | 'oauth2' | 'none';

  /** Current validation status. */
  status: ContractStatus;

  /** ISO-8601 timestamp of the last successful validation, or null if never validated. */
  lastValidated: string | null;

  /** Human-readable descriptions of any detected schema mismatches or issues. */
  issues: string[];
}

/**
 * A single detected difference between the current API surface and a previous
 * structural snapshot. Each diff corresponds to one field or endpoint change.
 */
export interface SchemaDiff {
  /** The route or endpoint where the difference was detected. */
  endpoint: string;

  /** How severe the change is for downstream consumers. */
  severity: SchemaDiffSeverity;

  /** The specific field or property name that changed. */
  field: string;

  /** Previous value or shape before the change. */
  before: unknown;

  /** Current value or shape after the change. */
  after: unknown;

  /** Human-readable explanation of what changed and why it matters. */
  description: string;
}

/**
 * Represents a single database migration and an assessment of whether it
 * contains destructive operations that could cause data loss.
 */
export interface MigrationSafetyCheck {
  /** Name of the migration directory (e.g. "20240101000000_add_users_table"). */
  migrationName: string;

  /** Whether this migration contains DROP TABLE, DROP COLUMN, or type changes. */
  destructive: boolean;

  /** Individual operations detected in the migration SQL. */
  operations: Array<{ type: string; table: string; column?: string }>;

  /** Human-readable warnings about risky operations found. */
  warnings: string[];

  /** Whether the migration is safe to apply without data loss. */
  safe: boolean;
}

/**
 * Top-level evidence payload produced by the contract testing engine.
 * Written to `.pulse/current/PULSE_CONTRACT_EVIDENCE.json`.
 */
export interface ContractTestEvidence {
  /** ISO-8601 timestamp when this evidence was generated. */
  generatedAt: string;

  /** Aggregate counts summarising the contract health. */
  summary: {
    /** Total number of provider contracts defined. */
    totalContracts: number;

    /** Number of contracts with status "valid". */
    validContracts: number;

    /** Number of contracts with status "broken". */
    brokenContracts: number;

    /** Number of contracts with status "untested". */
    untestedContracts: number;

    /** Number of schema diffs classified as "breaking". */
    breakingChanges: number;

    /** Number of migrations flagged as destructive. */
    destructiveMigrations: number;
  };

  /** Full list of provider contracts, including their validation status. */
  contracts: ProviderContract[];

  /** All detected schema differences between current and previous snapshots. */
  schemaDiffs: SchemaDiff[];

  /** Migration safety assessments for each Prisma migration file. */
  migrationChecks: MigrationSafetyCheck[];
}
