import { Global, Module } from '@nestjs/common';
import { CorrelationIdMiddleware } from './correlation-id.middleware';

@Global()
@Module({
  providers: [CorrelationIdMiddleware],
  exports: [CorrelationIdMiddleware],
})
export class ObservabilityModule {}
