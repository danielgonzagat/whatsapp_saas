import { Injectable, Optional } from '@nestjs/common';
import { PulseArtifactService } from '../../pulse/pulse-artifact.service';
import type { AgentPulseSelfModel } from './agent-runtime.types';
import { readStringArray } from '../../common/parse';

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}


@Injectable()
export class AgentRuntimePulseSelfModelService {
  constructor(@Optional() private readonly pulseArtifacts?: PulseArtifactService) {}

  buildSelfModel(): AgentPulseSelfModel {
    if (!this.pulseArtifacts) {
      return this.empty('pulse_artifact_service_unavailable');
    }

    try {
      const snapshot = readRecord(this.pulseArtifacts.getProductionSnapshot());
      const machineReadiness = readRecord(snapshot.machineReadiness);
      const certificatePayload = readRecord(snapshot.certificate);
      const certificate = readRecord(certificatePayload.data);
      const directivePayload = readRecord(snapshot.directive);
      const directive = readRecord(directivePayload.data);

      const score = typeof certificate.score === 'number' ? certificate.score : null;
      const status = snapshot.status === 'ready' || snapshot.status === 'degraded' ? snapshot.status : 'empty';
      const authorityMode =
        typeof snapshot.authorityMode === 'string' ? snapshot.authorityMode : 'advisory';
      const readiness = readRecord(machineReadiness.readiness);
      const canWorkNow =
        machineReadiness.status === 'READY' ||
        readiness.canWorkNow === true ||
        directive.canWorkNow === true;
      const canDeclareComplete =
        certificate.status === 'CERTIFIED' ||
        certificate.productionAutonomyVerdict === 'SIM' ||
        directive.canDeclareComplete === true;

      const blockingReasons = [
        ...readStringArray(machineReadiness.blockingReasons),
        ...readStringArray(certificate.blockingReasons),
        ...readStringArray(directive.blockingReasons),
      ];
      const nextSafeUnits = readStringArray(directive.nextExecutableUnits).slice(0, 6);

      return {
        status,
        authorityMode,
        canWorkNow,
        canDeclareComplete,
        score,
        blockingReasons: [...new Set(blockingReasons)].slice(0, 12),
        nextSafeUnits,
        generatedAt: new Date().toISOString(),
      };
    } catch {
      return this.empty('pulse_snapshot_read_failed');
    }
  }

  private empty(reason: string): AgentPulseSelfModel {
    return {
      status: 'empty',
      authorityMode: 'advisory',
      canWorkNow: false,
      canDeclareComplete: false,
      score: null,
      blockingReasons: [reason],
      nextSafeUnits: [],
      generatedAt: new Date().toISOString(),
    };
  }
}
