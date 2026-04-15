import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminAuditModule } from '../audit/admin-audit.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminDestructiveController } from './admin-destructive.controller';
import { DestructiveIntentService } from './destructive-intent.service';
import { DestructiveIntentRegistry } from './destructive-handler.registry';

/**
 * SP-8 destructive operations module. Exposes the intent service + a
 * registry singleton that every domain module (accounts, products,
 * carteira, iam) can inject to register its own handlers during
 * bootstrap. No domain handlers are registered inside this module —
 * that keeps the dependency graph flat and avoids madge cycles.
 */
@Module({
  imports: [PrismaModule, AdminPermissionsModule, AdminAuditModule],
  controllers: [AdminDestructiveController],
  providers: [DestructiveIntentService, DestructiveIntentRegistry],
  exports: [DestructiveIntentService, DestructiveIntentRegistry],
})
export class AdminDestructiveModule {}
