import { Module } from '@nestjs/common';
import { LineageModule } from '../lineage/lineage.module';
import { AbiBuilderService } from './abi-builder.service';
import { PulseTruthSnapshotService } from './pulse-truth-snapshot.service';

@Module({
  imports: [LineageModule],
  providers: [AbiBuilderService, PulseTruthSnapshotService],
  exports: [AbiBuilderService, PulseTruthSnapshotService],
})
export class AbiModule {}
