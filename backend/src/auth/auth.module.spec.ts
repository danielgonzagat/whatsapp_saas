import { MODULE_METADATA } from '@nestjs/common/constants';
import { PaymentsModule } from '../payments/payments.module';
import { AuthModule } from './auth.module';

describe('AuthModule', () => {
  it('imports PaymentsModule so AuthService can resolve ConnectService', () => {
    const imports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, AuthModule) ?? []) as unknown[];

    expect(imports).toContain(PaymentsModule);
  });
});
