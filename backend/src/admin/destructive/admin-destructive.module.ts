import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminAuditModule } from '../audit/admin-audit.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminDestructiveController } from './admin-destructive.controller';
import { DestructiveIntentService } from './destructive-intent.service';
import { DestructiveIntentRegistry } from './destructive-handler.registry';
import { CachePurgeHandler } from './handlers/cache-purge.handler';
import { ForceLogoutGlobalHandler } from './handlers/force-logout-global.handler';

/**
 * SP-8 destructive operations module. Exposes the intent service + a
 * registry singleton that every domain module (accounts, products,
 * carteira, iam) can inject to register its own handlers during
 * bootstrap. Ops-level handlers (FORCE_LOGOUT_GLOBAL, CACHE_PURGE)
 * live here because they don't belong to any domain — they touch
 * auth sessions and in-memory caches directly.
 */
@Module({
  imports: [PrismaModule, AdminPermissionsModule, AdminAuditModule],
  controllers: [AdminDestructiveController],
  providers: [
    DestructiveIntentService,
    DestructiveIntentRegistry,
    ForceLogoutGlobalHandler,
    CachePurgeHandler,
  ],
  exports: [DestructiveIntentService, DestructiveIntentRegistry],
})
export class AdminDestructiveModule implements OnModuleInit {
  constructor(
    private readonly registry: DestructiveIntentRegistry,
    private readonly forceLogout: ForceLogoutGlobalHandler,
    private readonly cachePurge: CachePurgeHandler,
  ) {}

  /** On module init. */
  onModuleInit(): void {
    this.registry.register(this.forceLogout);
    this.registry.register(this.cachePurge);
  }
}
