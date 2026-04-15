import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AdminAuditInterceptor } from './audit/admin-audit.interceptor';
import { AdminAuditModule } from './audit/admin-audit.module';
import { AdminAuthModule } from './auth/admin-auth.module';
import { AdminPermissionsModule } from './permissions/admin-permissions.module';
import { AdminSeedModule } from './seed/admin-seed.module';
import { AdminSessionsModule } from './sessions/admin-sessions.module';
import { AdminUsersModule } from './users/admin-users.module';

@Module({
  imports: [
    AdminAuditModule,
    AdminPermissionsModule,
    AdminAuthModule,
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
