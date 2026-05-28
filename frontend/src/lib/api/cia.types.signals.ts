// Cia market signal + insight type definitions. Extracted from cia.types.ts
// as part of the gate-fix-D split (keep each file <= 400 LOC). The barrel
// `cia.types.ts` re-exports every symbol below so existing consumers that
// import from '@/lib/api/cia.types' or '@/lib/api/cia' continue to compile
// without modification.

/** Cia market signal shape. */
export interface CiaMarketSignal {
  /** Id property. */
  id?: string;
  /** Normalized key property. */
  normalizedKey?: string;
  /** Frequency property. */
  frequency?: number;
  /** Category property. */
  category?: string;
  /** Updated at property. */
  updatedAt?: string;
  [extra: string]: unknown;
}

/** Cia insight shape. */
export interface CiaInsight {
  /** Id property. */
  id?: string;
  /** Type property. */
  type?: string;
  /** Title property. */
  title?: string;
  /** Description property. */
  description?: string;
  /** Severity property. */
  severity?: string;
  [extra: string]: unknown;
}
