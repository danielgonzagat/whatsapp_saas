import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import type { MindActionContext } from '../../mind-code-native.types';

export type QualityInvariant =
  | 'no_cross_workspace_reads'
  | 'negative_lift_fallback'
  | 'unsupported_transport_guard'
  | 'opt_out_guard'
  | 'no_payment_execution'
  | 'brain_tick_recent';

export interface QualityViolation {
  invariant: QualityInvariant;
  detail: string;
}

export interface QualityCheck {
  invariant: QualityInvariant;
  passed: boolean;
  detail: string;
}

export interface QualityReport {
  total: number;
  passed: number;
  failed: number;
  checks: QualityCheck[];
}

function fail(invariant: QualityInvariant, detail: string): QualityCheck {
  return { invariant, passed: false, detail };
}

function pass(invariant: QualityInvariant, detail: string): QualityCheck {
  return { invariant, passed: true, detail };
}

@Injectable()
export class MindQualityService {
  private readonly logger = StructuredLogger.from(MindQualityService.name);

  constructor() {
    this.logger.debug?.(`MindQualityService initialized`);
  }

  checkCrossWorkspaceReads(
    workspaceId: string,
    records: Array<{ workspaceId: string }>,
  ): QualityCheck {
    const foreign = records.filter((record) => record.workspaceId !== workspaceId);
    if (foreign.length > 0) {
      return fail(
        'no_cross_workspace_reads',
        `${foreign.length} records belong to foreign workspace(s) instead of ${workspaceId}`,
      );
    }
    return pass(
      'no_cross_workspace_reads',
      `All ${records.length} records scoped to workspace ${workspaceId}`,
    );
  }

  checkNegativeLiftFallback(input: {
    lift: number;
    pZScore: number;
    samples: number;
    fallbackActive: boolean;
    minSamples?: number;
  }): QualityCheck {
    const minSamples = input.minSamples ?? 30;

    if (input.lift < 0 && input.pZScore <= -1.96 && input.samples >= minSamples) {
      if (!input.fallbackActive) {
        return fail(
          'negative_lift_fallback',
          `Negative lift (${input.lift.toFixed(3)}) with z=${input.pZScore.toFixed(2)} and n=${input.samples} should trigger fallback but did not`,
        );
      }
      return pass(
        'negative_lift_fallback',
        `Fallback correctly activated for negative lift=${input.lift.toFixed(3)} z=${input.pZScore.toFixed(2)} n=${input.samples}`,
      );
    }

    return pass(
      'negative_lift_fallback',
      `Lift=${input.lift.toFixed(3)} does not require fallback (z=${input.pZScore.toFixed(2)}, n=${input.samples}, min=${minSamples})`,
    );
  }

  checkUnsupportedTransportGuard(action: string, context: MindActionContext): QualityCheck {
    if (action.includes('audio') && context.supportsAudio === false) {
      return fail(
        'unsupported_transport_guard',
        `Action "${action}" uses audio but channel does not support audio`,
      );
    }

    if (action.includes('document') && context.supportsDocument === false) {
      return fail(
        'unsupported_transport_guard',
        `Action "${action}" uses document but channel does not support document`,
      );
    }

    return pass(
      'unsupported_transport_guard',
      `Action "${action}" is compatible with channel transport capabilities`,
    );
  }

  checkOptOutGuard(context: MindActionContext): QualityCheck {
    if (context.contactOptOut) {
      return fail('opt_out_guard', 'Contact has opt-out registered — no message should be sent');
    }
    return pass('opt_out_guard', 'Contact has no opt-out registered');
  }

  checkNoPaymentExecution(action: string): QualityCheck {
    const lowerAction = action.toLowerCase();
    const blocked = ['execute_payment', 'process_payment', 'charge_card', 'pay_now'].some(
      (keyword) => lowerAction.includes(keyword),
    );

    if (blocked) {
      return fail(
        'no_payment_execution',
        `Action "${action}" would execute a payment — MIND must not execute payments`,
      );
    }

    return pass('no_payment_execution', `Action "${action}" does not execute payments`);
  }

  checkTickHealth(input: { lastTickAt: Date | null; maxAgeMs?: number; now: Date }): QualityCheck {
    if (!input.lastTickAt) {
      return fail('brain_tick_recent', 'MIND tick never ran for this workspace');
    }
    const ageMs = input.now.getTime() - input.lastTickAt.getTime();
    const maxAgeMs = input.maxAgeMs ?? 15 * 60 * 1000;
    if (ageMs > maxAgeMs) {
      return fail('brain_tick_recent', `MIND tick is stale by ${ageMs}ms`);
    }
    return pass('brain_tick_recent', `MIND tick age ${ageMs}ms is within ${maxAgeMs}ms`);
  }

  runAllChecks(input: {
    workspaceId: string;
    records: Array<{ workspaceId: string }>;
    liftData: {
      lift: number;
      pZScore: number;
      samples: number;
      fallbackActive: boolean;
    };
    actions: Array<{ action: string; context: MindActionContext }>;
  }): QualityReport {
    const checks: QualityCheck[] = [
      this.checkCrossWorkspaceReads(input.workspaceId, input.records),
      this.checkNegativeLiftFallback(input.liftData),
    ];

    for (const item of input.actions) {
      checks.push(this.checkUnsupportedTransportGuard(item.action, item.context));
      checks.push(this.checkOptOutGuard(item.context));
      checks.push(this.checkNoPaymentExecution(item.action));
    }

    const passed = checks.filter((check) => check.passed).length;
    const failed = checks.filter((check) => !check.passed).length;

    return { total: checks.length, passed, failed, checks };
  }
}
