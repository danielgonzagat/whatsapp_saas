import { Module, Global } from '@nestjs/common';
import { I18nService } from './i18n.service';
import { BillingModule } from '../billing/billing.module';

@Global()
@Module({
  imports: [BillingModule],
  providers: [I18nService],
  exports: [I18nService],
})
export class I18nModule {}
