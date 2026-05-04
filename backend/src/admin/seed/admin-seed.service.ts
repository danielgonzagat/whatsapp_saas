import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminRole } from '@prisma/client';
import { OpsAlertService } from '../../observability/ops-alert.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminAuthService } from '../auth/admin-auth.service';

/**
 * Idempotent seed for the initial OWNER account.
 *
 * Runs on every backend boot. If the account already exists, nothing is
 * changed — we intentionally never overwrite an existing row so that a
 * rotated password / completed MFA setup survives redeploys.
 *
 * Controlled by `ADMIN_SEED_OWNER_ENABLED` env var (default: true in
 * non-test environments). Disable it in tests that want a clean slate.
 */
@Injectable()
export class AdminSeedService implements OnModuleInit {
  private readonly logger = new Logger(AdminSeedService.name);

  private static readonly BOOTSTRAP_EMAIL = 'danielgonzagatj@gmail.com';
  private static readonly BOOTSTRAP_NAME = 'Daniel Gonzaga';

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly config: ConfigService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /** On module init. */
  async onModuleInit(): Promise<void> {
    const enabled = this.config.get<string>('ADMIN_SEED_OWNER_ENABLED') ?? 'true';
    if (enabled.toLowerCase() === 'false') {
      this.logger.log('ADMIN_SEED_OWNER_ENABLED=false — skipping owner seed');
      return;
    }

    try {
      await this.seedOwner();
    } catch (error: unknown) {
      // Never crash boot on seed failure — the admin module still boots and
      // the error is recorded.
      this.logger.error(
        `Owner seed failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      void this.opsAlert?.alertOnCriticalError(error, 'AdminSeedService.seedOwner');
    }
  }

  private async seedOwner(): Promise<void> {
    const existing = await this.prisma.adminUser.findUnique({
      where: { email: AdminSeedService.BOOTSTRAP_EMAIL },
    });
    if (existing) {
      this.logger.log(
        `Owner seed: account ${AdminSeedService.BOOTSTRAP_EMAIL} already exists (${existing.id})`,
      );
      return;
    }

    const bootstrapCredential = String(
      this.config.get<string>('ADMIN_SEED_OWNER_INITIAL_PASSWORD') || '',
    ).trim();
    if (!bootstrapCredential) {
      this.logger.error(
        'Owner seed skipped: ADMIN_SEED_OWNER_INITIAL_PASSWORD must be configured.',
      );
      return;
    }

    const passwordHash = await AdminAuthService.hashPassword(bootstrapCredential);
    const user = await this.prisma.adminUser.create({
      data: {
        name: AdminSeedService.BOOTSTRAP_NAME,
        email: AdminSeedService.BOOTSTRAP_EMAIL,
        passwordHash,
        role: AdminRole.OWNER,
        mfaEnabled: false,
        mfaPendingSetup: true,
        passwordChangeRequired: true,
      },
    });

    await this.audit.append({
      adminUserId: user.id,
      action: 'admin.seed.owner_created',
      entityType: 'AdminUser',
      entityId: user.id,
      details: { email: user.email },
    });

    this.logger.log(
      `Owner seed: created ${user.email} (${user.id}) — first login will force password change + MFA setup`,
    );
  }
}
