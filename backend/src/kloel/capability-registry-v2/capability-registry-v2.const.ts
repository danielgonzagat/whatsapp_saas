import type { CapabilityDefinition } from './capability-registry-v2.types';
import { COMMERCE_CAPABILITY_DEFINITIONS } from './capability-registry-v2.definitions.commerce';
import { CORE_CAPABILITY_DEFINITIONS } from './capability-registry-v2.definitions.core';
import { OPERATIONS_CAPABILITY_DEFINITIONS } from './capability-registry-v2.definitions.operations';

/**
 * KLOEL CAPABILITY REGISTRY — Single source of truth
 *
 * Every action the Kloel can perform is defined here.
 * This IS the registry. Adding a capability here = it is dispatchable.
 */
export const CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
  ...CORE_CAPABILITY_DEFINITIONS,
  ...COMMERCE_CAPABILITY_DEFINITIONS,
  ...OPERATIONS_CAPABILITY_DEFINITIONS,
];
export const CAPABILITY_MAP = new Map<string, CapabilityDefinition>(
  CAPABILITY_DEFINITIONS.map((cap) => [cap.id, cap]),
);

/** Map capability ID -> tier grouping */
export const CAPABILITIES_BY_TIER: Record<number, CapabilityDefinition[]> =
  CAPABILITY_DEFINITIONS.reduce<Record<number, CapabilityDefinition[]>>((acc, cap) => {
    if (!acc[cap.tier]) {
      acc[cap.tier] = [];
    }
    acc[cap.tier].push(cap);
    return acc;
  }, {});