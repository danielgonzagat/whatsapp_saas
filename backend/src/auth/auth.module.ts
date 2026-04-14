import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailService } from './email.service';
import { GoogleAuthService } from './google-auth.service';
import { getJwtExpiresIn, getJwtSecret } from './jwt-config';
// NOTA: RedisModule já é configurado globalmente no AppModule com REDIS_URL

@Module({
  imports: [
    PrismaModule,
    // RedisModule - REMOVIDO: já configurado globalmente
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: {
        expiresIn: getJwtExpiresIn(),
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, EmailService, GoogleAuthService],
  exports: [AuthService, JwtModule, EmailService, GoogleAuthService],
})
export class AuthModule {}
