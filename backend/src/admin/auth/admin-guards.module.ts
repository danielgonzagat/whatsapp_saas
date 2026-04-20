import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { resolveRequiredAdminJwtSecret } from './admin-jwt-secret';
import { AdminAuthGuard } from './guards/admin-auth.guard';

/**
 * Leaf module that provides the admin JWT and the guards which depend only
 * on PrismaService + JwtService + Reflector. Extracted from AdminAuthModule
 * so that AdminAuditModule can depend on the guards without pulling in
 * AdminAuthService (which itself depends on AdminAuditService, forming a
 * cycle that madge flagged in SP-0..2 ratchet).
 *
 * Dependency graph after extraction:
 *   AdminGuardsModule          → leaf (Prisma, Jwt, Config)
 *   AdminPermissionsModule     → AdminGuardsModule (re-exports)
 *   AdminAuditModule           → AdminPermissionsModule
 *   AdminAuthModule            → AdminAuditModule, AdminGuardsModule
 *   AdminUsers/Sessions/Seed   → AdminAuthModule (transitively everything)
 *
 * No cycles. The guard is re-exported here so consumers just need this one
 * import.
 */
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = resolveRequiredAdminJwtSecret(config.get<string>('ADMIN_JWT_SECRET'));
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
  providers: [AdminAuthGuard],
  exports: [AdminAuthGuard, JwtModule],
})
export class AdminGuardsModule {}
