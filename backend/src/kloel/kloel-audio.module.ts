import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { AudioController } from './audio.controller';
import { AudioService } from './audio.service';

@Module({
  imports: [BillingModule],
  controllers: [AudioController],
  providers: [AudioService],
  exports: [AudioService],
})
export class KloelAudioModule {}
