import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { WelcomeAndOnboardingEmailService } from './welcome-onboarding-email.service';

/** Notifications module. */
@Module({
  imports: [PrismaModule, ConfigModule, forwardRef(() => AuthModule)],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationPreferencesService, WelcomeAndOnboardingEmailService],
  exports: [NotificationsService, NotificationPreferencesService, WelcomeAndOnboardingEmailService],
})
export class NotificationsModule {}
