import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { AudioService } from './audio.service';

@Module({
  imports: [BillingModule],
  providers: [AudioService],
  exports: [AudioService],
})
export class KloelAudioModule {}
