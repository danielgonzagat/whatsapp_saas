import { Global, Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { I18nService } from './i18n.service';

@Global()
@Module({
  imports: [BillingModule],
  providers: [I18nService],
  exports: [I18nService],
})
export class I18nModule {}
