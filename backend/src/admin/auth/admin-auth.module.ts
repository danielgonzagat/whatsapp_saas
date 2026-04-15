import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminAuditModule } from '../audit/admin-audit.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginAttemptsService } from './admin-login-attempts.service';
import { AdminMfaService } from './admin-mfa.service';
import { AdminAuthGuard } from './guards/admin-auth.guard';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    forwardRef(() => AdminAuditModule),
    AdminPermissionsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('ADMIN_JWT_SECRET');
        if (!secret) {
          throw new Error('ADMIN_JWT_SECRET must be set to boot the admin module');
        }
        return {
          secret,
          signOptions: {
            issuer: 'kloel-admin-backend',
            audience: 'adm.kloel.com',
          },
          verifyOptions: {
            audience: 'adm.kloel.com',
          },
        };
      },
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminMfaService, AdminLoginAttemptsService, AdminAuthGuard],
  exports: [AdminAuthService, AdminAuthGuard, JwtModule],
})
export class AdminAuthModule {}
