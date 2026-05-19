import type { AbiValence } from '../abi/abi-schema';

export const VOLUME_THRESHOLD = 100;

export interface ValenceBucket {
  readonly valence: AbiValence;
  readonly count: number;
}

export interface TokenBucket {
  readonly token: string;
  readonly count: number;
}

export interface ProductEntry {
  readonly productId: string;
  readonly role: string;
}

export interface DerivedOperational {
  readonly typicalHours: readonly number[];
  readonly typicalEntityTypes: readonly string[];
  readonly eventCount: number;
}

export interface DerivedLanguage {
  readonly tone: string;
  readonly vocabulary: readonly string[];
}

export interface DerivedProduct {
  readonly catalog: readonly ProductEntry[];
}

export interface DerivedCustomer {
  readonly leadCount: number;
  readonly conversionCount: number;
  readonly conversionRatio: number;
  readonly commonStages: readonly string[];
}

export interface DerivedTemporal {
  readonly peakHours: readonly number[];
  readonly typicalCycleHours: number;
}

export interface DerivedDecisionPatterns {
  readonly typicalNextSteps: readonly string[];
  readonly typicalEscalations: readonly string[];
}
