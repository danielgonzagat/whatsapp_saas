import { Module } from '@nestjs/common';
import { ChannelHealthMonitorService } from './channel-health.monitor.service';

@Module({
  providers: [ChannelHealthMonitorService],
  exports: [ChannelHealthMonitorService],
})
export class ChannelSurvivalModule {}
