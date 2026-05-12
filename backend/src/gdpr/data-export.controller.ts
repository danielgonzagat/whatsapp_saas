import { BadRequestException, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { GdprService } from './gdpr.service';

/**
 * LGPD / GDPR — Data Export Controller
 *
 * Allows authenticated users to request a full export of their personal data
 * stored in the platform, in compliance with LGPD Art. 18 / GDPR Art. 20.
 */
@Controller('gdpr')
@RouteClass('mutate')
export class DataExportController {
  constructor(private readonly gdprService: GdprService) {}

  /** Export data. */
  @Post('export')
  @UseGuards(JwtAuthGuard)
  async exportData(@Req() req: AuthenticatedRequest) {
    const userId = req.user?.sub;
    const workspaceId = req.user?.workspaceId;

    if (!userId || !workspaceId) {
      throw new BadRequestException('User identity required for data export');
    }

    return this.gdprService.requestExport(userId, workspaceId);
  }
}
