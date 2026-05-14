import { Injectable, Logger } from '@nestjs/common';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type { SpineEventInput } from '../spine/spine-event.types';
import type { GateVerdict } from './pulse-gates.types';

export interface PulseSpineBridgeOpts {
  readonly workspaceId?: string | undefined;
  readonly correlationId?: string | undefined;
}

const PROVENANCE: SpineEventInput['provenance'] = {
  source: 'production',
  processor: 'pulse-spine-bridge',
  processorVersion: '1.0.0',
  schemaVersion: '1.0.0',
};

@Injectable()
export class PulseSpineBridge {
  private readonly logger = new Logger(PulseSpineBridge.name);

  public constructor(private readonly spineEmitter: SpineEmitterService) {}

  public async recordVerdict(
    verdict: GateVerdict,
    opts: PulseSpineBridgeOpts = {},
  ): Promise<void> {
    const eventName: 'pulse.gate_passed' | 'pulse.gate_failed' =
      verdict.status === 'PASS' ? 'pulse.gate_passed' : 'pulse.gate_failed';

    const payload: Record<string, unknown> = {
      gateName: verdict.gateName,
      mode: verdict.mode,
      ...{ reason: verdict.reason },
    };

    if (verdict.evidence !== undefined) {
      payload['evidence'] = verdict.evidence;
    }

    const input: SpineEventInput = {
      eventName,
      truthMode: 'observed',
      provenance: PROVENANCE,
      payload,
      ...(opts.workspaceId !== undefined ? { workspaceId: opts.workspaceId } : {}),
      ...(opts.correlationId !== undefined ? { correlationId: opts.correlationId } : {}),
    };

    const envelope = await this.spineEmitter.emit(input);
    this.logger.debug(
      `spine emitted ${eventName} gate=${verdict.gateName} mode=${verdict.mode} eventId=${envelope.eventId}`,
    );
  }
}
