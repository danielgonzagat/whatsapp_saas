import { Module } from '@nestjs/common';
import { SpineModule } from '../spine/spine.module';
import { AntiRemorseService } from './anti-remorse.service';
import { ActivationCompanionService } from './activation-companion.service';
import { FirstValueDetector } from './first-value.detector';
import { SatisfactionCollectorService } from './satisfaction-collector.service';
import { TestimonialTimingAdvisor } from './testimonial-timing.advisor';
import { ReferralPromptTimingAdvisor } from './referral-prompt-timing.advisor';
import { RepurchaseWindowDetector } from './repurchase-window.detector';
import { ExpansionFitDetector } from './expansion-fit.detector';
import { ChurnRiskDetector } from './churn-risk.detector';
import { RetentionHonestTactics } from './retention-honest.tactics';
import { WinBackWindowAdvisor } from './winback-window.advisor';
import { LtvProjectionService } from './ltv-projection.service';

/**
 * PostsaleConsumersModule — Camada XVIII (UTP-POSTSALE-001..012).
 *
 * Consumer logic for the post-sale & LTV pipeline. Each service consumes
 * spine events and produces structured assessments. Services that detect
 * terminal states (first_value, churn_risk, repurchase_window, win_back)
 * emit canonical `commerce.post_sale.*` events through the SpineEmitterService.
 *
 * Implements B0.6 (operate past sale toward LTV), PCI.1 §3.12
 * (commerce.post_sale.* events), and PCI.5 conventions.
 */
@Module({
  imports: [SpineModule],
  providers: [
    AntiRemorseService,
    ActivationCompanionService,
    FirstValueDetector,
    SatisfactionCollectorService,
    TestimonialTimingAdvisor,
    ReferralPromptTimingAdvisor,
    RepurchaseWindowDetector,
    ExpansionFitDetector,
    ChurnRiskDetector,
    RetentionHonestTactics,
    WinBackWindowAdvisor,
    LtvProjectionService,
  ],
  exports: [
    AntiRemorseService,
    ActivationCompanionService,
    FirstValueDetector,
    SatisfactionCollectorService,
    TestimonialTimingAdvisor,
    ReferralPromptTimingAdvisor,
    RepurchaseWindowDetector,
    ExpansionFitDetector,
    ChurnRiskDetector,
    RetentionHonestTactics,
    WinBackWindowAdvisor,
    LtvProjectionService,
  ],
})
export class PostsaleConsumersModule {}
