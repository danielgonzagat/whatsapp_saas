import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('register-device')
  async registerDevice(
    @Request() req,
    @Body() body: { token: string; platform: string },
  ) {
    return this.notificationsService.registerDevice(
      req.user.userId,
      body.token,
      body.platform,
    );
  }
}
