import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { NotificationsService } from './notifications.service';
import {
  NotificationPreferencesService,
  sanitizeNotificationPreferencesUpdate,
} from './notification-preferences.service';
import { RouteClass } from '../common/throttler/route-class.decorator';

/** Notifications controller. */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@RouteClass('mutate')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationPreferences: NotificationPreferencesService,
  ) {}

  /** Register device. */
  @Post('register-device')
  async registerDevice(
    @Request() req: AuthenticatedRequest,
    @Body() body: { token: string; platform: string },
  ) {
    return this.notificationsService.registerDevice(req.user.sub, body.token, body.platform);
  }

  /** Current user's e-mail notification preferences (workspaceId+userId from the JWT). */
  @Get('preferences')
  async getPreferences(@Request() req: AuthenticatedRequest) {
    return this.notificationPreferences.getPreferences(req.user.workspaceId, req.user.sub);
  }

  /** Update the current user's e-mail notification preferences. */
  @Put('preferences')
  async updatePreferences(
    @Request() req: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    const updates = sanitizeNotificationPreferencesUpdate(body);
    if (Object.keys(updates).length === 0) {
      throw new BadRequestException(
        'Nenhuma preferência de notificação válida informada (esperado: emailTips boolean).',
      );
    }
    return this.notificationPreferences.updatePreferences(
      req.user.workspaceId,
      req.user.sub,
      updates,
    );
  }
}
