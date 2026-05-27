import { Injectable, Logger } from '@nestjs/common';
import type { SpineEmitterService } from '../spine/spine-emitter.service';
import type { SpineEventEnvelope } from '../spine/spine-event.types';

export interface RuntimeMetricsSnapshot {
  readonly operationsTotal: number;
  readonly spineEventsTotal: number;
  readonly valenceTaggedEventsTotal: number;
  readonly gateChecksTotal: number;
  readonly gateFailsTotal: number;
  readonly eventsToOperationsRatio: number;
  readonly valenceCoveragePct: number;
}

@Injectable()
export class RuntimeMetricsService {
  private readonly logger = new Logger(RuntimeMetricsService.name);
  private operationsTotal = 0;
  private spineEventsTotal = 0;
  private valenceTaggedEventsTotal = 0;
  private gateChecksTotal = 0;
  private gateFailsTotal = 0;
  private unsubscribeSpine: (() => void) | null = null;

  incrementOperations(delta = 1): void {
    if (delta <= 0) {return;}
    this.operationsTotal += delta;
  }

  incrementGateCheck(passed: boolean): void {
    this.gateChecksTotal += 1;
    if (!passed) {
      this.gateFailsTotal += 1;
    }
  }

  subscribeToSpine(spine: SpineEmitterService): void {
    if (this.unsubscribeSpine) {
      this.logger.debug('Spine subscriber already registered — ignoring duplicate');
      return;
    }
    this.unsubscribeSpine = spine.subscribe((envelope: SpineEventEnvelope) => {
      this.spineEventsTotal += 1;
      if (envelope.valence !== undefined) {
        this.valenceTaggedEventsTotal += 1;
      }
    });
  }

  wireToSpine(spine: SpineEmitterService): void {
    if (this.unsubscribeSpine) {
      return;
    }
    this.unsubscribeSpine = spine.subscribe((envelope: SpineEventEnvelope) => {
      this.spineEventsTotal += 1;
      if (envelope.valence !== undefined) {
        this.valenceTaggedEventsTotal += 1;
      }
    });
  }

  getMetrics(): RuntimeMetricsSnapshot {
    const eventsToOperationsRatio =
      this.operationsTotal > 0
        ? Number((this.spineEventsTotal / this.operationsTotal).toFixed(4))
        : 0;
    const valenceCoveragePct =
      this.spineEventsTotal > 0
        ? Number(((this.valenceTaggedEventsTotal / this.spineEventsTotal) * 100).toFixed(2))
        : 0;
    return {
      operationsTotal: this.operationsTotal,
      spineEventsTotal: this.spineEventsTotal,
      valenceTaggedEventsTotal: this.valenceTaggedEventsTotal,
      gateChecksTotal: this.gateChecksTotal,
      gateFailsTotal: this.gateFailsTotal,
      eventsToOperationsRatio,
      valenceCoveragePct,
    };
  }
}
