import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { FunnelsService } from './funnels.service';
import { FunnelsController } from './funnels.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [WhatsappModule],
  controllers: [FunnelsController],
  providers: [FunnelsService],
  exports: [FunnelsService],
})
export class FunnelsModule implements OnModuleInit {
  private readonly logger = new Logger(FunnelsModule.name);

  constructor(private readonly funnelsService: FunnelsService) {}

  onModuleInit() {
    if (!process.env.JEST_WORKER_ID && process.env.NODE_ENV !== 'test') {
      this.logger.log('FunnelsModule inicializado.');
    }
  }
}
