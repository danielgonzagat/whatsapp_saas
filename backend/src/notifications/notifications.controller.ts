import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
import { RouteClass } from '../common/throttler/route-class.decorator';

/** Notifications controller. */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@RouteClass('mutate')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** Register device. */
  @Post('register-device')
  async registerDevice(@Request() req, @Body() body: { token: string; platform: string }) {
    return this.notificationsService.registerDevice(req.user.sub, body.token, body.platform);
  }
}
