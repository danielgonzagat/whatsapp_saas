import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';

import { FraudEngine } from './fraud.engine';

/** Isolated FraudEngine module to avoid pulling the whole PaymentsModule into consumers. */
@Module({
  imports: [PrismaModule],
  providers: [FraudEngine],
  exports: [FraudEngine],
})
export class FraudModule {}
