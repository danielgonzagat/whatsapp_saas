import { Injectable, Logger } from '@nestjs/common';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type { SpineEventInput } from '../spine/spine-event.types';

const PROCESSOR = 'member-area-event-emitter';
const PROCESSOR_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';

export interface EnrollmentContext {
  enrollmentId: string;
  workspaceId: string;
  memberAreaId: string;
  studentEmail: string;
  studentName?: string;
  correlationId?: string;
}

export interface ProgressContext {
  enrollmentId: string;
  workspaceId: string;
  memberAreaId: string;
  studentEmail: string;
  progress: number;
  totalLessons?: number;
  correlationId?: string;
}

export interface DropoutContext {
  enrollmentId: string;
  workspaceId: string;
  memberAreaId: string;
  studentEmail: string;
  correlationId?: string;
}

export interface AffiliatePerformanceContext {
  workspaceId: string;
  window: string;
  metrics: Readonly<Record<string, unknown>>;
  correlationId?: string;
}

export interface AffiliateCommissionContext {
  workspaceId: string;
  affiliateLinkId: string;
  commissionCents: number;
  grossCents: number;
  affiliateWorkspaceId: string;
  correlationId?: string;
}

@Injectable()
export class MemberAreaEventEmitterService {
  private readonly logger = new Logger(MemberAreaEventEmitterService.name);

  constructor(private readonly spine: SpineEmitterService) {}

  emitEnrolled(ctx: EnrollmentContext): void {
    this.safeEmit({
      eventName: 'commerce.member_area.enrolled',
      workspaceId: ctx.workspaceId,
      entityRef: { entityType: 'member_enrollment', entityId: ctx.enrollmentId },
      truthMode: 'observed',
      provenance: {
        source: 'production',
        processor: PROCESSOR,
        processorVersion: PROCESSOR_VERSION,
        schemaVersion: SCHEMA_VERSION,
      },
      payload: {
        enrollmentId: ctx.enrollmentId,
        memberAreaId: ctx.memberAreaId,
        studentEmail: ctx.studentEmail,
        ...(ctx.studentName ? { studentName: ctx.studentName } : {}),
      },
      ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
    });
  }

  emitProgressed(ctx: ProgressContext): void {
    this.safeEmit({
      eventName: 'commerce.member_area.progressed',
      workspaceId: ctx.workspaceId,
      entityRef: { entityType: 'member_enrollment', entityId: ctx.enrollmentId },
      truthMode: 'observed',
      provenance: {
        source: 'production',
        processor: PROCESSOR,
        processorVersion: PROCESSOR_VERSION,
        schemaVersion: SCHEMA_VERSION,
      },
      payload: {
        enrollmentId: ctx.enrollmentId,
        memberAreaId: ctx.memberAreaId,
        studentEmail: ctx.studentEmail,
        progress: ctx.progress,
        ...(ctx.totalLessons !== undefined ? { totalLessons: ctx.totalLessons } : {}),
      },
      ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
    });
  }

  emitDroppedOut(ctx: DropoutContext): void {
    this.safeEmit({
      eventName: 'commerce.member_area.dropped_out',
      workspaceId: ctx.workspaceId,
      entityRef: { entityType: 'member_enrollment', entityId: ctx.enrollmentId },
      truthMode: 'observed',
      provenance: {
        source: 'production',
        processor: PROCESSOR,
        processorVersion: PROCESSOR_VERSION,
        schemaVersion: SCHEMA_VERSION,
      },
      payload: {
        enrollmentId: ctx.enrollmentId,
        memberAreaId: ctx.memberAreaId,
        studentEmail: ctx.studentEmail,
      },
      ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
    });
  }

  emitAffiliatePerformanceMeasured(ctx: AffiliatePerformanceContext): void {
    this.safeEmit({
      eventName: 'commerce.affiliate.performance_measured',
      workspaceId: ctx.workspaceId,
      truthMode: 'observed',
      provenance: {
        source: 'production',
        processor: PROCESSOR,
        processorVersion: PROCESSOR_VERSION,
        schemaVersion: SCHEMA_VERSION,
      },
      payload: {
        window: ctx.window,
        metrics: ctx.metrics,
      },
      ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
    });
  }

  emitAffiliateCommissionCalculated(ctx: AffiliateCommissionContext): void {
    this.safeEmit({
      eventName: 'commerce.affiliate.commission_calculated',
      workspaceId: ctx.workspaceId,
      entityRef: { entityType: 'affiliate_link', entityId: ctx.affiliateLinkId },
      truthMode: 'observed',
      provenance: {
        source: 'production',
        processor: PROCESSOR,
        processorVersion: PROCESSOR_VERSION,
        schemaVersion: SCHEMA_VERSION,
      },
      payload: {
        affiliateLinkId: ctx.affiliateLinkId,
        commissionCents: ctx.commissionCents,
        grossCents: ctx.grossCents,
        affiliateWorkspaceId: ctx.affiliateWorkspaceId,
      },
      ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
    });
  }

  private safeEmit(input: SpineEventInput): void {
    try {
      this.spine.emit(input);
    } catch (err) {
      this.logger.error(
        `Failed to emit spine event ${input.eventName}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
