import { Module } from '@nestjs/common';
import { SpineModule } from '../spine/spine.module';
import { EventEmitAuditEventEmitterService } from './event-emit-audit-event-emitter.service';

/**
 * EventEmitAuditEmitter module — wires the audit-surface emitter (UTP-EVENT-EMIT-AUDIT).
 *
 * Exports the emitter service so it can be injected by controllers,
 * schedulers, or other modules that need to trigger a coverage audit.
 */
@Module({
  imports: [SpineModule],
  providers: [EventEmitAuditEventEmitterService],
  exports: [EventEmitAuditEventEmitterService],
})
export class EventEmitAuditEmitterModule {}
