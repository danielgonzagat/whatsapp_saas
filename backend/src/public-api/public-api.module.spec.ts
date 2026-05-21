import { MODULE_METADATA } from '@nestjs/common/constants';
import { PrismaModule } from '../prisma/prisma.module';
import { InboxModule } from '../inbox/inbox.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { ApiKeyGuard } from './api-key.guard';
import { PublicApiController } from './public-api.controller';
import { PublicApiModule } from './public-api.module';

describe('PublicApiModule', () => {
  it('imports PrismaModule, InboxModule and ApiKeysModule', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, PublicApiModule) ?? [];

    expect(imports).toContain(PrismaModule);
    expect(imports).toContain(InboxModule);
    expect(imports).toContain(ApiKeysModule);
  });

  it('registers PublicApiController', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, PublicApiModule) ?? [];

    expect(controllers).toContain(PublicApiController);
  });

  it('provides ApiKeyGuard', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, PublicApiModule) ?? [];

    expect(providers).toContain(ApiKeyGuard);
  });
});
