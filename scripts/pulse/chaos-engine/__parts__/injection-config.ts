import type { ChaosScenarioKind, ChaosTarget } from '../../types.chaos-engine';
import { discoverChaosScenarioKindLabels } from '../../dynamic-reality-kernel/__parts__/type-contract-engines';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';

export function generateInjectionConfig(
  kind: ChaosScenarioKind,
  target: ChaosTarget,
  overrides?: Partial<{
    durationMs: number;
    intensity: number;
    params: Record<string, number>;
  }>,
): {
  durationMs: number;
  intensity: number;
  params: Record<string, number>;
} {
  if (!discoverChaosScenarioKindLabels().has(kind)) {
    throw new Error(`generateInjectionConfig: unknown ChaosScenarioKind ${kind}`);
  }
  const params = overrides?.params ?? {};
  const observedValues = Object.values(params).filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0,
  );
  const observedBase =
    observedValues.length > deriveZeroValue()
      ? Math.max(...observedValues)
      : Math.max(deriveUnitValue(), target.length * kind.length);
  const durationMs =
    overrides?.durationMs ?? observedBase * Math.max(deriveUnitValue(), target.split('_').length);
  const intensity =
    overrides?.intensity ??
    Math.min(
      deriveUnitValue(),
      Math.max(0.1, kind.split('_').join('').length / Math.max(target.length, deriveUnitValue())),
    );

  switch (kind) {
    case 'latency':
      return {
        durationMs,
        intensity,
        params: {
          latencyMs: params.latencyMs ?? observedBase,
        },
      };
    case 'connection_drop':
      return {
        durationMs,
        intensity,
        params: {
          reconnectWindowMs: params.reconnectWindowMs ?? observedBase,
        },
      };
    case 'slow_close':
      return {
        durationMs,
        intensity,
        params: {
          drainTimeMs: params.drainTimeMs ?? observedBase,
        },
      };
    case 'partition':
      return {
        durationMs,
        intensity,
        params: {
          isolatedMs: params.isolatedMs ?? observedBase,
          healDelayMs:
            params.healDelayMs ??
            Math.max(deriveUnitValue(), Math.ceil(observedBase / target.length)),
        },
      };
    case 'packet_loss':
      return {
        durationMs,
        intensity,
        params: { lossPercent: params.lossPercent ?? observedBase },
      };
    case 'kill_process':
      return {
        durationMs,
        intensity,
        params: {
          restartDelayMs: params.restartDelayMs ?? observedBase,
        },
      };
    case 'dns_failure':
      return {
        durationMs,
        intensity,
        params: {
          failureDurationMs: params.failureDurationMs ?? observedBase,
        },
      };
    case 'disk_full':
      return {
        durationMs,
        intensity,
        params: {
          freeBytesThreshold: params.freeBytesThreshold ?? observedBase,
        },
      };
    case 'cpu_spike':
      return {
        durationMs,
        intensity,
        params: {
          spikeDurationMs: params.spikeDurationMs ?? observedBase,
        },
      };
  }
}
