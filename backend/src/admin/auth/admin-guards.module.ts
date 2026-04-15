import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
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
        let secret = config.get<string>('ADMIN_JWT_SECRET');
        if (!secret) {
          // CI/e2e environments may not have ADMIN_JWT_SECRET wired
          // yet. Fall back to a deterministic test-only value when
          // NODE_ENV=test or CI=true so the boot smoke can run. Any
          // real deploy (production, staging, preview) sets
          // NODE_ENV=production and will still throw.
          if (process.env.NODE_ENV === 'test' || process.env.CI === 'true') {
            secret = 'kloel-admin-ci-test-secret-not-for-production';
          } else {
            throw new Error('ADMIN_JWT_SECRET must be set to boot the admin module');
          }
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
  providers: [AdminAuthGuard],
  exports: [AdminAuthGuard, JwtModule],
})
export class AdminGuardsModule {}
