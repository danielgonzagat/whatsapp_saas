import { Module } from '@nestjs/common';
import { LineageModule } from '../lineage/lineage.module';
import { AbiBuilderService } from './abi-builder.service';
import { AbiSnapshotCacheService } from './abi-snapshot-cache.service';
import { ReadinessTruthSnapshotService } from './readiness-truth-snapshot.service';

@Module({
  imports: [LineageModule],
  providers: [AbiBuilderService, AbiSnapshotCacheService, ReadinessTruthSnapshotService],
  exports: [AbiBuilderService, AbiSnapshotCacheService, ReadinessTruthSnapshotService],
})
export class AbiModule {}
