import { Module } from '@nestjs/common';
import { KloelRuleEngineService } from './kloel-rule-engine.service';

@Module({
  providers: [KloelRuleEngineService],
  exports: [KloelRuleEngineService],
})
export class KloelRulesModule {}
