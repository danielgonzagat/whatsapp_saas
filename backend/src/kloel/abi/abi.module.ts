import { Module } from '@nestjs/common';
import { LineageModule } from '../lineage/lineage.module';
import { AbiBuilderService } from './abi-builder.service';

@Module({
  imports: [LineageModule],
  providers: [AbiBuilderService],
  exports: [AbiBuilderService],
})
export class AbiModule {}
