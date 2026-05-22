import { Module } from '@nestjs/common';
import { ProofLevelService } from './proof-level.service';

@Module({
  providers: [ProofLevelService],
  exports: [ProofLevelService],
})
export class ProofLevelModule {}
