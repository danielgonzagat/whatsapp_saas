import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GdprController } from './gdpr.controller';
import { GdprService } from './gdpr.service';

/** Gdpr module — LGPD/GDPR data export and deletion. */
@Module({
  imports: [AuthModule],
  controllers: [GdprController],
  providers: [GdprService],
  exports: [GdprService],
})
export class GdprModule {}
