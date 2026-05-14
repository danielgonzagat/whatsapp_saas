import { Module } from '@nestjs/common';
import { AbiAbTelemetryService } from './abi-ab-telemetry.service';
import { AbiAbHarnessService } from './abi-ab-harness.service';

export { ABI_PATH_RUNNER, ABI_COMMERCIAL_OUTCOME_DETECTOR } from './abi-ab-harness.service';

@Module({
  providers: [AbiAbTelemetryService, AbiAbHarnessService],
  exports: [AbiAbTelemetryService, AbiAbHarnessService],
})
export class AbiAbModule {}
