import { Module } from '@nestjs/common';
import { BehaviorSnapshotService } from './behavior-snapshot.service';
import { DriftDetectorService } from './drift-detector.service';

@Module({
  providers: [BehaviorSnapshotService, DriftDetectorService],
  exports: [BehaviorSnapshotService, DriftDetectorService],
})
export class DriftModule {}
