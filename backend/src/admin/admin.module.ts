import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AdminAccountsModule } from './accounts/admin-accounts.module';
import { AdminAuditInterceptor } from './audit/admin-audit.interceptor';
import { AdminAuditModule } from './audit/admin-audit.module';
import { AdminAuthModule } from './auth/admin-auth.module';
import { AdminDashboardModule } from './dashboard/admin-dashboard.module';
import { AdminPermissionsModule } from './permissions/admin-permissions.module';
import { AdminSeedModule } from './seed/admin-seed.module';
import { AdminSessionsModule } from './sessions/admin-sessions.module';
import { AdminTransactionsModule } from './transactions/admin-transactions.module';
import { AdminUsersModule } from './users/admin-users.module';

@Module({
  imports: [
    AdminAuditModule,
    AdminPermissionsModule,
    AdminAuthModule,
    AdminDashboardModule,
    AdminAccountsModule,
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
