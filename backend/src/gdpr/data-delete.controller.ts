import { BadRequestException, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { WebhookEndpoint } from '../common/decorators/webhook-endpoint.decorator';
import { GdprService } from './gdpr.service';

/**
 * LGPD / GDPR — Data Deletion Controller
 *
 * Allows authenticated users to request deletion of their personal data,
 * in compliance with LGPD Art. 18 / GDPR Art. 17 (Right to Erasure).
 */
@Controller('gdpr')
@RouteClass('mutate')
export class DataDeleteController {
  constructor(private readonly gdprService: GdprService) {}

  /** Delete data. */
  @WebhookEndpoint('GDPR external data deletion request')
  @Post('delete')
  @UseGuards(JwtAuthGuard)
  async deleteData(@Req() req: AuthenticatedRequest) {
    const userId = req.user?.sub;
    const workspaceId = req.user?.workspaceId;

    if (!userId || !workspaceId) {
      throw new BadRequestException('User identity required for data deletion');
    }

    return this.gdprService.requestDeletion(userId, workspaceId);
  }
}
