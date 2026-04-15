import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AdminAccountsModule } from './accounts/admin-accounts.module';
import { AdminAuditInterceptor } from './audit/admin-audit.interceptor';
import { AdminAuditModule } from './audit/admin-audit.module';
import { AdminAuthModule } from './auth/admin-auth.module';
import { AdminCarteiraModule } from './carteira/admin-carteira.module';
import { AdminChatModule } from './chat/admin-chat.module';
import { AdminDashboardModule } from './dashboard/admin-dashboard.module';
import { AdminDestructiveModule } from './destructive/admin-destructive.module';
import { AdminPermissionsModule } from './permissions/admin-permissions.module';
import { AdminProductsModule } from './products/admin-products.module';
import { AdminSeedModule } from './seed/admin-seed.module';
import { AdminSessionsModule } from './sessions/admin-sessions.module';
import { AdminTransactionsModule } from './transactions/admin-transactions.module';
import { AdminUsersModule } from './users/admin-users.module';

@Module({
  imports: [
    AdminAuditModule,
    AdminPermissionsModule,
    AdminAuthModule,
    AdminChatModule,
    AdminDashboardModule,
    AdminDestructiveModule,
    AdminAccountsModule,
    AdminCarteiraModule,
    AdminProductsModule,
    AdminTransactionsModule,
    AdminUsersModule,
    AdminSessionsModule,
    AdminSeedModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AdminAuditInterceptor,
    },
  ],
})
export class AdminModule {}
