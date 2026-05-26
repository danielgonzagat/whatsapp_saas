import { Module, forwardRef } from '@nestjs/common';
import { GoalFieldModule } from '../kloel/goal-field/goal-field.module';
import { KloelModule } from '../kloel/kloel.module';
import { MindModule } from '../kloel/mind/mind.module';
import { SpineModule } from '../kloel/spine/spine.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { CiaBacklogRunService } from './cia-backlog-run.service';
import { CiaBootstrapService } from './cia-bootstrap.service';
import { CiaChatFilterService } from './cia-chat-filter.service';
import { CiaCognitiveHealthService } from './cia-cognitive-health.service';
import { CiaInlineFallbackService } from './cia-inline-fallback.service';
import { CiaRemoteBacklogService } from './cia-remote-backlog.service';
import { CiaRuntimeService } from './cia-runtime.service';
import { CiaRuntimeService as WhatsappCiaRuntimeService } from './cia-runtime.abstract';
import { CiaRuntimeStateService } from './cia-runtime-state.service';
import { CiaSendHelpersService } from './cia-send-helpers.service';
import { CiaController } from './cia.controller';
import { CiaService } from './cia.service';
import { CIA_RUNTIME_SERVICE } from './cia-runtime.port';

/** Cia module. */
@Module({
  imports: [
    GoalFieldModule,
    KloelModule,
    MindModule,
    SpineModule,
    forwardRef(() => WhatsappModule),
  ],
  controllers: [CiaController],
  providers: [
    CiaService,
    CiaBacklogRunService,
    CiaBootstrapService,
    CiaChatFilterService,
    CiaCognitiveHealthService,
    CiaInlineFallbackService,
    CiaRemoteBacklogService,
    CiaRuntimeService,
    { provide: CIA_RUNTIME_SERVICE, useExisting: CiaRuntimeService },
    { provide: WhatsappCiaRuntimeService, useExisting: CiaRuntimeService },
    CiaRuntimeStateService,
    CiaSendHelpersService,
  ],
  exports: [
    CiaService,
    CIA_RUNTIME_SERVICE,
    WhatsappCiaRuntimeService,
    CiaRuntimeService,
    CiaChatFilterService,
    CiaCognitiveHealthService,
    CiaRuntimeStateService,
    CiaBootstrapService,
    CiaBacklogRunService,
    CiaInlineFallbackService,
    CiaRemoteBacklogService,
    CiaSendHelpersService,
  ],
})
/**
 * @cluster whatsapp_saas/backend/cia
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class CiaModule {}
