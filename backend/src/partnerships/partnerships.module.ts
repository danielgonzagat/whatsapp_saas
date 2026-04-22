import { Module } from '@nestjs/common';
import { EmailService } from '../auth/email.service';
import { PartnershipsController } from './partnerships.controller';
import { PartnershipsService } from './partnerships.service';

/** Partnerships module. */
@Module({
  controllers: [PartnershipsController],
  providers: [PartnershipsService, EmailService],
  exports: [PartnershipsService],
})
export class PartnershipsModule {}
