import { Controller, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../prisma/prisma.service';

/**
 * LGPD / GDPR — Data Export Controller
 *
 * Allows authenticated users to request a full export of their personal data
 * stored in the platform, in compliance with LGPD Art. 18 / GDPR Art. 20.
 */
@Controller('gdpr')
export class DataExportController {
  private readonly logger = new Logger(DataExportController.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Export data. */
  @Post('export')
  @UseGuards(JwtAuthGuard)
  async exportData(@Req() req: AuthenticatedRequest) {
    const userId = req.user?.sub;
    const workspaceId = req.user?.workspaceId;

    this.logger.log(`Data export requested by user ${userId}`);

    // Gather all user-related data from primary tables
    const [agent, workspace, auditLogs, messages] = await Promise.all([
      this.prisma.agent.findFirst({
        where: workspaceId ? { id: userId, workspaceId } : { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          workspaceId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      workspaceId
        ? this.prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
              id: true,
              name: true,
              createdAt: true,
            },
          })
        : null,
      this.prisma.auditLog.findMany({
        where: workspaceId ? { agentId: userId, workspaceId } : { agentId: userId },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        select: {
          action: true,
          resource: true,
          createdAt: true,
          ipAddress: true,
        },
      }),
      workspaceId
        ? this.prisma.message
            .findMany({
              where: { workspaceId },
              orderBy: { createdAt: 'desc' },
              take: 500,
              select: {
                id: true,
                content: true,
                direction: true,
                createdAt: true,
              },
            })
            .catch(() => [])
        : [],
    ]);

    return {
      exportedAt: new Date().toISOString(),
      user: agent,
      workspace,
      auditLogs,
      messages,
    };
  }
}
