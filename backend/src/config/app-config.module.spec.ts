process.env.DATABASE_URL = 'postgres://localhost:5432/test';
process.env.JWT_SECRET = 'test-secret';

import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigModule } from './app-config.module';

describe('AppConfigModule', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AppConfigModule],
    }).compile();
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  it('compiles and exposes ConfigService', () => {
    expect(module).toBeDefined();
    const configService = module.get<ConfigService>(ConfigService);
    expect(configService).toBeDefined();
  });

  it('resolves required DATABASE_URL env var', () => {
    const configService = module.get<ConfigService>(ConfigService);
    expect(configService.get('DATABASE_URL')).toBe('postgres://localhost:5432/test');
  });

  it('applies defaults for optional values', () => {
    const configService = module.get<ConfigService>(ConfigService);
    expect(configService.get('PORT')).toBe(3001);
    expect(configService.get('NODE_ENV')).toBe('test'); // Jest sets NODE_ENV=test
    expect(configService.get('JWT_EXPIRES_IN')).toBe('30m');
  });

  it('resolves FRONTEND_URL default', () => {
    const configService = module.get<ConfigService>(ConfigService);
    expect(configService.get('FRONTEND_URL')).toBe('http://localhost:3000');
  });

  it('resolves custom JWT_SECRET', () => {
    const configService = module.get<ConfigService>(ConfigService);
    expect(configService.get('JWT_SECRET')).toBe('test-secret');
  });
});
