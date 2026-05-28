import { Module } from '@nestjs/common';
import { LineageModule } from '../lineage/lineage.module';
import { AbiBuilderService } from './abi-builder.service';
import { AbiSnapshotCacheService } from './abi-snapshot-cache.service';
import { PulseTruthSnapshotService } from './pulse-truth-snapshot.service';

@Module({
  imports: [LineageModule],
  providers: [AbiBuilderService, AbiSnapshotCacheService, PulseTruthSnapshotService],
  exports: [AbiBuilderService, AbiSnapshotCacheService, PulseTruthSnapshotService],
})
export class AbiModule {}
