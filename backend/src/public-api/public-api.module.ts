import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiKeyGuard } from './api-key.guard';
import { PublicApiController } from './public-api.controller';

import { ApiKeysModule } from '../api-keys/api-keys.module';

/** Public api module. */
@Module({
  imports: [PrismaModule, InboxModule, ApiKeysModule],
  controllers: [PublicApiController],
  providers: [ApiKeyGuard],
})
export class PublicApiModule {}
