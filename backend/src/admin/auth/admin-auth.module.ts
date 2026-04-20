import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminAuditModule } from '../audit/admin-audit.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminGuardsModule } from './admin-guards.module';
import { AdminLoginAttemptsService } from './admin-login-attempts.service';
import { AdminMfaService } from './admin-mfa.service';
import { AdminSessionFactory } from './admin-session-factory';

/** Admin auth module. */
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    AdminGuardsModule,
    AdminPermissionsModule,
    AdminAuditModule,
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminMfaService, AdminLoginAttemptsService, AdminSessionFactory],
  exports: [AdminAuthService, AdminGuardsModule],
})
export class AdminAuthModule {}
