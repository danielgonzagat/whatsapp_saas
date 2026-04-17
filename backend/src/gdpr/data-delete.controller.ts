import { BadRequestException, Controller, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../prisma/prisma.service';

/**
 * LGPD / GDPR — Data Deletion Controller
 *
 * Allows authenticated users to request deletion of their personal data,
 * in compliance with LGPD Art. 18 / GDPR Art. 17 (Right to Erasure).
 */
@Controller('gdpr')
export class DataDeleteController {
  private readonly logger = new Logger(DataDeleteController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  @Post('delete')
  @UseGuards(JwtAuthGuard)
  async deleteData(@Req() req: AuthenticatedRequest) {
    const userId = req.user?.sub;
    const workspaceId = req.user?.workspaceId;

    if (!userId) {
      throw new BadRequestException('User identity required for data deletion');
    }

    this.logger.warn(`Data deletion requested by user ${userId}`);

    // Log the deletion request before executing
    await this.auditService.log({
      workspaceId: workspaceId || 'system',
      agentId: userId,
      action: 'GDPR_DATA_DELETE_REQUESTED',
      resource: 'Agent',
      resourceId: userId,
      details: { requestedAt: new Date().toISOString() },
    });

    // Anonymize user data (soft-delete approach for audit compliance)
    await this.prisma.agent.update({
      where: { id: userId },
      data: {
        name: '[DELETED]',
        email: `deleted-${userId}@removed.local`,
      },
    });

    // Record completion
    await this.auditService.log({
      workspaceId: workspaceId || 'system',
      agentId: userId,
      action: 'GDPR_DATA_DELETE_COMPLETED',
      resource: 'Agent',
      resourceId: userId,
      details: { completedAt: new Date().toISOString() },
    });

    return {
      status: 'deleted',
      userId,
      deletedAt: new Date().toISOString(),
      note: 'Personal data has been anonymized. Audit logs retained per legal obligation.',
    };
  }
}
