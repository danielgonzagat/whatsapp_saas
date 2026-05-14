import { Module } from '@nestjs/common';
import { SpineModule } from '../spine/spine.module';
import { PulseSpineBridge } from './pulse-spine.bridge';

@Module({
  imports: [SpineModule],
  providers: [PulseSpineBridge],
  exports: [PulseSpineBridge],
})
export class PulseGatesModule {}
