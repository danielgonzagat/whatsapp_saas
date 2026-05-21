import { Module } from '@nestjs/common';
import { AttentionRankerService } from './attention-ranker.service';

/**
 * Camada XXII — Decision Clarity module.
 */
@Module({
  providers: [AttentionRankerService],
  exports: [AttentionRankerService],
})
export class ClarityModule {}
