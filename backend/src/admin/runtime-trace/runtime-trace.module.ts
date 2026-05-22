import { Module } from '@nestjs/common';
import { KloelModule } from '../../kloel/kloel.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { RuntimeTraceController } from './runtime-trace.controller';

@Module({
  imports: [AdminPermissionsModule, KloelModule],
  controllers: [RuntimeTraceController],
})
export class AdminRuntimeTraceModule {}
