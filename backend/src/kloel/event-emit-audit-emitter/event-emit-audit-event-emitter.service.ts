import { Injectable, Logger } from '@nestjs/common';
import { SpineCoverageAuditorService } from '../spine/spine-coverage-auditor.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type { CoverageReport } from '../spine/spine-coverage-auditor.service';

/**
 * EventEmitAuditEventEmitterService — surface emitter for the
 * event-emit-audit surface.
 *
 * This surface has no business transitions of its own (it observes other
 * surfaces). Instead of hooking into transition sites like a commerce
 * surface would, this service runs the SpineCoverageAuditorService and
 * emits pulse.gate_passed or pulse.gate_failed with the coverage report
 * as payload.
 *
 * Emission NEVER throws. The audit path must not break consumers.
 */
@Injectable()
export class EventEmitAuditEventEmitterService {
  private readonly logger = new Logger(EventEmitAuditEventEmitterService.name);

  public constructor(
    private readonly spineEmitter: SpineEmitterService,
    private readonly coverageAuditor: SpineCoverageAuditorService,
  ) {}

  /**
   * Run the coverage audit and emit a gate result event on the spine.
   *
   * Returns the CoverageReport regardless of gate outcome — the caller
   * can inspect it directly without reading the spine.
   */
  public auditAndEmit(windowN: number = 1000): CoverageReport {
    const report = this.coverageAuditor.audit(windowN);

    const zeroCoverageSurfaces = report.surfaces
      .filter((s) => s.coverageRatio === 0)
      .map((s) => s.surfaceId);

    const gatePassed = zeroCoverageSurfaces.length === 0;
    const eventName = gatePassed ? 'pulse.gate_passed' : 'pulse.gate_failed';

    try {
      this.spineEmitter.emit({
        eventName,
        truthMode: 'observed',
        provenance: {
          source: 'production',
          processor: 'event-emit-audit-emitter',
          processorVersion: '1.0.0',
          schemaVersion: '1.0.0',
        },
        valence: gatePassed ? 'positive' : 'negative',
        payload: {
          gateName: 'b17-surface-coverage',
          scannedEventCount: report.scannedEventCount,
          zeroCoverageSurfaces,
          surfaceCount: report.surfaces.length,
          surfaces: report.surfaces.map((s) => ({
            surfaceId: s.surfaceId,
            coverageRatio: s.coverageRatio,
            observedTransitions: s.observedTransitionCount,
            totalTransitions: s.totalCanonicalTransitions,
          })),
        },
      });
    } catch (err) {
      this.logger.error(
        `failed to emit coverage gate event — ${(err as Error).message}`,
      );
    }

    return report;
  }
}
