import { Global, Module } from '@nestjs/common';
import { OpsAlertService } from './ops-alert.service';

@Global()
@Module({
  providers: [OpsAlertService],
  exports: [OpsAlertService],
})
export class OpsAlertModule {}
