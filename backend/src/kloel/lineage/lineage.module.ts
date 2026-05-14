import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { IdentityProjectorService } from './identity-projector.service';
import { LineageGuardService } from './lineage-guard.service';
import { LineageLedgerService } from './lineage-ledger.service';
import { PrismaLineageLedgerRepository } from './lineage-ledger.prisma-repository';
import { LINEAGE_LEDGER_REPOSITORY } from './lineage.tokens';

/**
 * UTP-LINEAGE — NestJS module boot hook.
 *
 * Implements OnModuleInit to call LineageLedgerService.bootstrapGenesis()
 * on every app start. Idempotent — the ledger service refuses to duplicate
 * entry 1 when it already matches the canonical Genesis.
 */
@Injectable()
export class LineageBootstrapHook implements OnModuleInit {
  private readonly logger = new Logger(LineageBootstrapHook.name);

  public constructor(private readonly ledger: LineageLedgerService) {}

  public async onModuleInit(): Promise<void> {
    try {
      await this.ledger.bootstrapGenesis();
    } catch (err: unknown) {
      this.logger.error(
        `bootstrapGenesis failed during module init: ${(err as Error).message}`,
      );
    }
  }
}

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
    LineageBootstrapHook,
    LineageGuardService,
    IdentityProjectorService,
  ],
  exports: [LineageLedgerService, LineageGuardService, IdentityProjectorService],
})
export class LineageModule {}
