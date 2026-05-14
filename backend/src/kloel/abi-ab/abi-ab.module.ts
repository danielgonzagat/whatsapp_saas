import { Module } from '@nestjs/common';
import { AbiAbTelemetryService } from './abi-ab-telemetry.service';

@Module({
  providers: [AbiAbTelemetryService],
  exports: [AbiAbTelemetryService],
})
export class AbiAbModule {}
