import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { GoogleAuthService } from './google-auth.service';
import { getJwtExpiresIn, getJwtSecret } from './jwt-config';
// NOTA: RedisModule já é configurado globalmente no AppModule com REDIS_URL

@Module({
  imports: [
    PrismaModule,
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
  providers: [AuthService, EmailService, GoogleAuthService],
  exports: [AuthService, JwtModule, EmailService, GoogleAuthService],
})
export class AuthModule {}
