import { Injectable, Logger } from '@nestjs/common';

/**
 * UTP-MIND-MULTI-001 — Multi-timescale coordinator.
 *
 * Implements B10 — four explicit timescales. The coordinator decides which
 * MIND services to invoke at each tick:
 *
 *   - immediate (ms)   — on-event handlers (valence-tagger, attention.allocate)
 *   - short    (s)     — windowed aggregations every ~5s
 *   - medium   (min/h) — Hebbian decay + mood aggregator + working-memory grooming
 *   - long     (days)  — consolidation cycle + skill maturation
 *
 * The coordinator does NOT own a scheduler — it provides a registry so the
 * BG processor (UTP-MIND-BG-001) can ask "which timescales are due?"
 */

export type Timescale = 'immediate' | 'short' | 'medium' | 'long';

export interface TimescaleConfig {
  readonly intervalMs: number;
  readonly description: string;
}

export const TIMESCALE_DEFAULTS: Readonly<Record<Timescale, TimescaleConfig>> = Object.freeze({
  immediate: { intervalMs: 0, description: 'on-event' },
  short: { intervalMs: 5_000, description: 'windowed seconds' },
  medium: { intervalMs: 60 * 60 * 1000, description: 'hourly maintenance' },
  long: { intervalMs: 24 * 60 * 60 * 1000, description: 'daily consolidation' },
});

@Injectable()
export class MultiTimescaleCoordinator {
  private readonly logger = new Logger(MultiTimescaleCoordinator.name);
  private readonly lastFireMsByScale = new Map<Timescale, number>();
  private readonly config: Readonly<Record<Timescale, TimescaleConfig>>;

  public constructor(config: Partial<Record<Timescale, TimescaleConfig>> = {}) {
    this.config = Object.freeze({
      immediate: { ...TIMESCALE_DEFAULTS.immediate, ...config.immediate },
      short: { ...TIMESCALE_DEFAULTS.short, ...config.short },
      medium: { ...TIMESCALE_DEFAULTS.medium, ...config.medium },
      long: { ...TIMESCALE_DEFAULTS.long, ...config.long },
    });
  }

  public dueScales(nowMs: number = Date.now()): readonly Timescale[] {
    const due: Timescale[] = [];
    for (const scale of ['short', 'medium', 'long'] as const) {
      const last = this.lastFireMsByScale.get(scale) ?? 0;
      if (nowMs - last >= this.config[scale].intervalMs) {
        due.push(scale);
      }
    }
    return due;
  }

  public markFired(scale: Timescale, nowMs: number = Date.now()): void {
    this.lastFireMsByScale.set(scale, nowMs);
    this.logger.debug(`timescale ${scale} fired at ${new Date(nowMs).toISOString()}`);
  }

  public lastFireMs(scale: Timescale): number {
    return this.lastFireMsByScale.get(scale) ?? 0;
  }

  public configFor(scale: Timescale): TimescaleConfig {
    return this.config[scale];
  }
}
