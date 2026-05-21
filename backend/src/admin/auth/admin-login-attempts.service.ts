import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/**
 * Tracks failed/successful admin logins so the rate-limit guard on
 * /admin/auth/login can decide whether to let a request through
 * (invariant I-ADMIN-5).
 *
 * A "locked" decision is made when either the email OR the source IP has
 * accumulated 5 failures in the last 15 minutes.
 */
@Injectable()
export class AdminLoginAttemptsService {
  private readonly logger = StructuredLogger.from(AdminLoginAttemptsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Is locked. */
  async isLocked(email: string, ip: string): Promise<boolean> {
    const since = new Date(Date.now() - WINDOW_MS);
    const [emailFailures, ipFailures] = await this.prisma.$transaction(
      [
        this.prisma.adminLoginAttempt.count({
          where: { email, success: false, createdAt: { gte: since } },
        }),
        this.prisma.adminLoginAttempt.count({
          where: { ip, success: false, createdAt: { gte: since } },
        }),
      ],
      { isolationLevel: 'ReadCommitted' },
    );
    if (emailFailures >= MAX_ATTEMPTS || ipFailures >= MAX_ATTEMPTS) {
      this.logger.warn('Login attempts lock threshold reached', {
        context: 'AdminLoginAttemptsService.isLocked',
        emailFailures,
        ipFailures,
        maxAttempts: MAX_ATTEMPTS,
      });
      return true;
    }
    return false;
  }

  /** Record. */
  async record(email: string, ip: string, success: boolean): Promise<void> {
    await this.prisma.adminLoginAttempt.create({
      data: { email, ip, success },
    });
  }
}
