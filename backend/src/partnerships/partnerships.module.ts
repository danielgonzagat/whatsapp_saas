import { Module } from '@nestjs/common';
import { PartnershipsController } from './partnerships.controller';
import { PartnershipsService } from './partnerships.service';

/** Partnerships module. */
@Module({
  controllers: [PartnershipsController],
  providers: [PartnershipsService],
  exports: [PartnershipsService],
})
export class PartnershipsModule {}
