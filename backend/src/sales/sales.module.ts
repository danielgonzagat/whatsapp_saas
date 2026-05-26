import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { SpineModule } from '../kloel/spine/spine.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';

import { SalesService } from './sales.service';/**
 * Sales module — in-chat sales creation (PIX, card, boleto).
 *
 * Imports:
 * - PrismaModule for DB access
 * - AuditModule for audit logging
 * - PaymentsModule (re-exports MercadoPagoModule) for real PIX generation
 * - SpineModule for event emission (sale.created, payment.pending)
 *
 * Exports: SalesService
 */
@Module({
  imports: [PrismaModule, AuditModule, PaymentsModule, SpineModule],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}