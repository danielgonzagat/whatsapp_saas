import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GdprController } from './gdpr.controller';
import { GdprService } from './gdpr.service';

/** Gdpr module — LGPD/GDPR data export and deletion. */
@Module({
  imports: [PrismaModule, AuthModule, JwtModule],
  controllers: [GdprController],
  providers: [GdprService],
  exports: [GdprService],
})
export class GdprModule {}
