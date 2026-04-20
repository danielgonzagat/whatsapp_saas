import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

/** Notifications controller. */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('register-device')
  async registerDevice(@Request() req, @Body() body: { token: string; platform: string }) {
    return this.notificationsService.registerDevice(req.user.sub, body.token, body.platform);
  }
}
