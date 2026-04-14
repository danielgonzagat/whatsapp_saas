import { Module } from '@nestjs/common';
import { PublicApiController } from './public-api.controller';
import { ApiKeyGuard } from './api-key.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { InboxModule } from '../inbox/inbox.module';

import { ApiKeysModule } from '../api-keys/api-keys.module';

@Module({
  imports: [PrismaModule, InboxModule, ApiKeysModule],
  controllers: [PublicApiController],
  providers: [ApiKeyGuard],
})
export class PublicApiModule {}
