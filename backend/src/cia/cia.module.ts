import { Module, forwardRef } from '@nestjs/common';
import { KloelModule } from '../kloel/kloel.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { CiaBacklogRunService } from './cia-backlog-run.service';
import { CiaBootstrapService } from './cia-bootstrap.service';
import { CiaChatFilterService } from './cia-chat-filter.service';
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
  imports: [KloelModule, forwardRef(() => WhatsappModule)],
  controllers: [CiaController],
  providers: [
    CiaService,
    CiaBacklogRunService,
    CiaBootstrapService,
    CiaChatFilterService,
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
    CiaRuntimeStateService,
    CiaBootstrapService,
    CiaBacklogRunService,
    CiaInlineFallbackService,
    CiaRemoteBacklogService,
    CiaSendHelpersService,
  ],
})
export class CiaModule {}
