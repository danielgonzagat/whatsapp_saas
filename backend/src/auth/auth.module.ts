import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { FacebookAuthService } from './facebook-auth.service';
import { GoogleAuthService } from './google-auth.service';
import { TikTokAuthService } from './tiktok-auth.service';
import { getJwtExpiresIn, getJwtSecret } from './jwt-config';
// NOTA: RedisModule já é configurado globalmente no AppModule com REDIS_URL

@Module({
  imports: [
    PrismaModule,
    PaymentsModule,
    // RedisModule - REMOVIDO: já configurado globalmente
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const expiresIn = config.get<string>('JWT_EXPIRES_IN');
        return {
          secret: String(config.get<string>('JWT_SECRET') || getJwtSecret()).trim(),
          signOptions: {
            expiresIn: (expiresIn as ReturnType<typeof getJwtExpiresIn>) || getJwtExpiresIn(),
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, EmailService, GoogleAuthService, FacebookAuthService, TikTokAuthService],
  exports: [
    AuthService,
    JwtModule,
    EmailService,
    GoogleAuthService,
    FacebookAuthService,
    TikTokAuthService,
  ],
})
export class AuthModule {}
