/**
 * PULSE Parser 50: Schema-derived payment-path consistency probes
 * Layer 4: End-to-End Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * This parser no longer encodes product/provider/table reality. It delegates to
 * schema-derived runtime probes so the evaluated codebase, not PULSE, defines
 * which numeric state needs consistency evidence.
 */

import type { Break, PulseConfig } from '../types';
import { runSchemaDerivedNumericConsistencyProbes } from './e2e-withdrawal';

/** Check e2e payment. */
export async function checkE2ePayment(config: PulseConfig): Promise<Break[]> {
  return runSchemaDerivedNumericConsistencyProbes(config, {
    source: 'schema-derived:e2e-payment-runtime-probe',
    detector: 'payment-path-numeric-observation',
    surface: 'schema-derived-payment-consistency',
  });
}
