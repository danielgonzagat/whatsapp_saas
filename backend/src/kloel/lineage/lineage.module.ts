import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { IdentityProjectorService } from './identity-projector.service';
import { LineageGuardService } from './lineage-guard.service';
import { LineageLedgerService } from './lineage-ledger.service';
import { PrismaLineageLedgerRepository } from './lineage-ledger.prisma-repository';
import { LINEAGE_LEDGER_REPOSITORY } from './lineage.tokens';

/**
 * UTP-LINEAGE wiring — NestJS module.
 *
 * Wires Camada I (Genesis & Lineage) into the Nest DI container. The
 * default repository is Prisma-backed; tests bind `InMemoryLineageLedgerRepository`
 * directly to the LINEAGE_LEDGER_REPOSITORY token.
 *
 * Exports the three operational services so consumers (ABI builder,
 * capability registry, PULSE) can inject them.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: LINEAGE_LEDGER_REPOSITORY,
      useClass: PrismaLineageLedgerRepository,
    },
    LineageLedgerService,
    LineageGuardService,
    IdentityProjectorService,
  ],
  exports: [LineageLedgerService, LineageGuardService, IdentityProjectorService],
})
export class LineageModule {}
