import { RedisModule } from '@nestjs-modules/ioredis';
import { Logger, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import type Redis from 'ioredis';
// rawbody removed (stripe webhook controller removed)

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { JwtModule } from '@nestjs/jwt';
import { AlertsGateway } from './alerts/alerts.gateway';
import { AuthModule } from './auth/auth.module'; // Enabled AuthModule
import { CacheModule } from './common/cache/cache.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard'; // Enabled JwtAuthGuard
import { RolesGuard } from './auth/roles.guard'; // Enabled RolesGuard
import { BillingModule } from './billing/billing.module';
import { PaymentsModule } from './payments/payments.module';
import { MarketplaceTreasuryModule } from './marketplace-treasury/marketplace-treasury.module';
import { WalletModule } from './wallet/wallet.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { FinancialAlertModule } from './common/financial-alert.module';
import { HttpTracingInterceptor } from './common/http-tracing.interceptor';
import { IdempotencyGuard } from './common/idempotency.guard';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { RequestIdInterceptor } from './common/request-id.interceptor';
import { RequestLoggerInterceptor } from './common/request-logger.interceptor';
import { AppConfigModule } from './config/app-config.module';
import { CrmModule } from './crm/crm.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FlowsModule } from './flows/flows.module';
import { HealthModule } from './health/health.module';
import { InboxModule } from './inbox/inbox.module';
import { LaunchModule } from './launch/launch.module';
import { MassSendModule } from './mass-send/mass-send.module';
import { MediaModule } from './media/media.module';
import { MetricsInterceptor } from './metrics/metrics.interceptor';
import { MetricsModule } from './metrics/metrics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ScrapersModule } from './scrapers/scrapers.module';
import { TeamModule } from './team/team.module';
import { VoiceModule } from './voice/voice.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { WorkspaceModule } from './workspaces/workspace.module';

import { ThrottlerModule } from '@nestjs/throttler';
import { THROTTLE_TIERS } from './common/throttler/throttler-config';
import { RouteClassGuard } from './common/throttler/route-class.guard';

import { AdminModule } from './admin/admin.module';
import { AffiliateModule } from './affiliate/affiliate.module';
import { AiBrainModule } from './ai-brain/ai-brain.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AnunciosModule } from './anuncios/anuncios.module';
import { AudioModule } from './audio/audio.module';
import { AuditModule } from './audit/audit.module';
import { getJwtSecret } from './auth/jwt-config';
import { AutopilotModule } from './autopilot/autopilot.module';
import { CalendarModule } from './calendar/calendar.module';
import { ChatModule } from './chat/chat.module';
import { CheckoutModule } from './checkout/checkout.module';
import { CiaModule } from './cia/cia.module';
import { PromptSanitizerMiddleware } from './common/middleware/prompt-sanitizer.middleware';
import { getRedisUrl, isRedisConfigured } from './common/redis/redis.util';
import { StorageModule } from './common/storage/storage.module';
import { CookieConsentModule } from './cookie-consent/cookie-consent.module';
import { ComplianceModule } from './compliance/compliance.module';
import { CopilotModule } from './copilot/copilot.module';

import { FollowUpModule } from './followup/followup.module';
import { GdprModule } from './gdpr/gdpr.module';
import { GrowthModule } from './growth/growth.module';
import { I18nModule } from './i18n/i18n.module';
import { KloelModule } from './kloel/kloel.module';
import { AuditLogMiddleware } from './kloel/middleware';
import { IdempotencyMiddleware } from './common/idempotency/idempotency.middleware';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { KycModule } from './kyc/kyc.module';
import { MarketingModule } from './marketing/marketing.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { MemberAreaModule } from './member-area/member-area.module';
import { MetaModule } from './meta/meta.module';
import { CorrelationIdMiddleware } from './common/observability/correlation-id.middleware';
import { ObservabilityModule } from './common/observability/observability.module';
import { OpsAlertModule } from './observability/ops-alert.module';
import { OpsModule } from './ops/ops.module';
import { PartnershipsModule } from './partnerships/partnerships.module';
import { AbiAbModule } from './kloel/abi-ab/abi-ab.module';
import { AffilModule } from './kloel/affil/affil.module';
import { EcosysModule } from './kloel/ecosys/ecosys.module';
import { LegitModule } from './kloel/legit/legit.module';
import { MoveModule } from './kloel/move/move.module';
import { GoalFieldModule } from './kloel/goal-field/goal-field.module';
import { DailyDashboardModule } from './kloel/daily-dashboard/daily-dashboard.module';
import { ColdstartModule } from './kloel/coldstart/coldstart.module';
import { CashModule } from './kloel/cash/cash.module';
import { HypproofModule } from './kloel/hypproof/hypproof.module';
import { InsightModule } from './kloel/insight/insight.module';
import { OfferModule } from './kloel/offer/offer.module';
import { PostsaleConsumersModule } from './kloel/postsale-consumers/postsale-consumers.module';
import { RecoveryModule } from './kloel/recovery/recovery.module';
import { DelegationModule } from './kloel/delegation/delegation.module';
import { LineageModule } from './kloel/lineage/lineage.module';
import { LocalIdentityModule } from './kloel/local-identity/local-identity.module';
import { MaturityModule } from './kloel/maturity/maturity.module';
import { MindModule } from './kloel/mind/mind.module';
import { SpineModule } from './kloel/spine/spine.module';
import { VtierModule } from './kloel/v-tier/v-tier.module';
import { TeamModule as KloelTeamModule } from './kloel/team/team.module';
import { TrustModule } from './kloel/trust/trust.module';
import { WisdomModule } from './kloel/wisdom/wisdom.module';
import { AgencyModule } from './kloel/agency/agency.module';
import { HealthyMoneyModule } from './kloel/healthy-money/healthy-money.module';
import { CapabilityRegistryModule } from './kloel/capability-registry/capability-registry.module';
import { ClarityModule } from './kloel/clarity/clarity.module';
import { CommemModule } from './kloel/commem/commem.module';
import { CreatorModule } from './kloel/creator/creator.module';
import { RoleModule } from './kloel/role/role.module';
import { WowModule } from './kloel/wow/wow.module';
import { ChannelModule } from './kloel/channel/channel.module';
import { ChannelPolicyModule } from './kloel/channel-policy/channel-policy.module';
import { DefensModule } from './kloel/defens/defens.module';
import { EvolModule } from './kloel/evol/evol.module';
import { PulseGatesModule } from './kloel/pulse-gates/pulse-gates.module';
import { IncentModule } from './kloel/incent/incent.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { ProductCategoriesModule } from './product-categories/product-categories.module';
import { PublicApiModule } from './public-api/public-api.module';
import { PulseModule } from './pulse/pulse.module';
import { ReportsModule } from './reports/reports.module';
import { TikTokAdsModule } from './tiktok-ads/tiktok-ads.module';
import { UnsubscribeModule } from './unsubscribe/unsubscribe.module';
import { VideoModule } from './video/video.module';
import {
  PaymentWebhookStripeController,
  PaymentWebhookGenericController,
} from './webhooks/payment-webhook.controller';
import { StripeWebhookLedgerService } from './webhooks/stripe-webhook-ledger.service';

/**
 * @cluster whatsapp_saas/backend/app.module.ts
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
const appLogger = new Logger('AppModule');
const isProd = process.env.NODE_ENV === 'production';
const REDIS_GLOBAL_LISTENER_BUDGET = 256;

function setRedisClientListenerBudget(client: Redis): void {
  client.setMaxListeners(Math.max(client.getMaxListeners(), REDIS_GLOBAL_LISTENER_BUDGET));
}

/** App module. */
@Module({
  imports: [
    // Variáveis de ambiente com validação Joi
    AppConfigModule,
    SentryModule.forRoot(),
    PublicApiModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: String(config.get<string>('JWT_SECRET') || getJwtSecret()).trim(),
      }),
    }),

    // Rate Limiting Global — route-class based tiers with per-tenant isolation
    // Route class definitions and documentation: src/common/throttler/throttler-config.ts
    ThrottlerModule.forRoot({
      throttlers: THROTTLE_TIERS,
    }),

    // Internacionalização global
    I18nModule,

    // Storage (local / S3 / R2)
    StorageModule,

    // Prisma (banco principal)
    PrismaModule,

    // Global cache service (wraps the global Redis connection)
    CacheModule,

    // Redis global para cache, rate limit, idempotência e eventos.
    // Em produção o resolver falha cedo quando Redis não estiver configurado.
    RedisModule.forRootAsync({
      useFactory: () => {
        const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
        const configured = isRedisConfigured();
        let url = 'redis://localhost:6379';
        try {
          url = getRedisUrl();
        } catch (err: unknown) {
          if (isProd) {
            throw err;
          }
          if (!isTestEnv) {
            appLogger.warn('Redis não configurado — usando localhost para desenvolvimento.');
          }
        }

        if (!configured) {
          if (!isTestEnv) {
            appLogger.warn('============================================');
            appLogger.warn('Redis NÃO configurado - funcionalidades limitadas');
            appLogger.warn('Filas (BullMQ) e cache dependem de Redis');
            appLogger.warn('Rate limit segue ativo (fallback local por processo)');
            appLogger.warn('Configure REDIS_URL para rate limit distribuído + filas');
            appLogger.warn('============================================');
          }
        } else {
          if (!isTestEnv) {
            appLogger.log('Redis configurado com URL resolvida');
          }
        }

        return {
          type: 'single' as const,
          url,
          options: {
            maxRetriesPerRequest: null,
            enableReadyCheck: false, // Não verifica conexão na inicialização
            lazyConnect: true, // Conecta apenas quando usado
            retryStrategy: (times: number) => {
              if (!configured) {
                return null;
              } // Não reconecta se não configurado
              return Math.min(times * 50, 2000);
            },
            reconnectOnError: () => configured, // Reconecta apenas se configurado
          },
          onClientReady: setRedisClientListenerBudget,
        };
      },
    }),

    // Módulos de domínio
    WorkspaceModule,
    WhatsappModule,
    MassSendModule,
    FlowsModule,
    CrmModule,
    CampaignsModule,
    ScrapersModule,
    InboxModule,
    BillingModule,
    AuthModule, // Enabled AuthModule
    HealthModule,
    MetricsModule,
    LaunchModule,
    MediaModule,
    VoiceModule,
    DashboardModule,
    AnalyticsModule,
    OpsModule,
    WebhooksModule,
    TeamModule,
    NotificationsModule,
    MarketplaceModule,
    AuditModule,
    AutopilotModule,

    AiBrainModule,
    GrowthModule,
    CalendarModule, // 📅 Integração com calendários
    ChatModule, // 💬 Chat conversation persistence
    CopilotModule, // 💬 Sales copilot HTTP + socket surface
    KloelModule, // 🧠 KLOEL - IA Comercial Autônoma
    CiaModule, // 🧠 CIA Runtime Surface
    FollowUpModule, // 📅 Agendamento de follow-ups
    AudioModule, // 🎤 Transcrição de áudio
    MemberAreaModule, // 🎓 Member Areas (Cursos, Comunidades)
    AffiliateModule, // 🤝 Sistema de Afiliados
    MarketingModule, // 📊 Marketing Command Center
    PartnershipsModule, // 🤝 Partnerships (Collaborators, Affiliates, Chat)
    VideoModule, // 🎬 Video generation jobs
    CheckoutModule, // Checkout System (products, plans, orders)
    KycModule, // KYC - Know Your Customer
    ReportsModule, // Reports & Analytics (Vendas, Assinaturas, Churn, etc.)
    MetaModule, // Meta Platform (OAuth, Graph API, Webhooks)
    PipelineModule, // 🧭 Sales pipeline / CRM board
    ProductCategoriesModule, // 🏷️ Workspace-scoped product categories
    GdprModule, // LGPD/GDPR data export and deletion
    CookieConsentModule, // Cookie consent management
    ComplianceModule, // OAuth/Meta/LGPD compliance callbacks and user rights endpoints
    FinancialAlertModule, // Financial alerting (global)
    OpsAlertModule, // OPS critical error alerting (global)
    CapabilityRegistryModule, // 📋 Capability Registry — real runtime evidence for no-overclaim gate (PCI.4 §3.4)
    AbiAbModule, // 🔬 UTP-ABI-005 — A/B telemetry for ABI substitution decisions
    LineageModule, // 🧬 Camada I — Genesis + Lineage Ledger + Identity Projector (cognitive organism)
    MindModule, // 🧠 MIND substrate — valence/attention/hebbian/consolidation/multi-timescale/BG (UTP-MIND-*)
    LocalIdentityModule, // 🏷️ Camada V — Per-workspace operational profile (UTP-LOCAL-IDENT-001..007)
    GoalFieldModule, // 🎯 Camada III — Dynamic Goal Field (29 detectors + emerge/select/survive/shadow)
    DailyDashboardModule, // 📊 R6 — Daily commercial dashboard (hot leads, abandoned carts, mood, opportunities)
    InsightModule, // 💡 Camada VII — Strategic Insight Engine (detectors + ranker + confidence + delivery)
    OfferModule, // 🎯 Camada XV — Offer Evolution Intelligence (bonus, promise, versioning, positioning, pricing)
    MaturityModule, // 📊 Camada VIII — Commercial Maturity Recognition (signals + classify + filter + guard)
    SpineModule, // 🧪 Spine — in-process event spine (B17 surface emitters publish here)
    PulseGatesModule, // 🛡️ PULSE gates — bridge gate verdicts into spine events (UTP-PULSE-SPINE-001)
    RecoveryModule, // 🛡️ Camada XIV — Mature Failure Recovery (self-detection, acknowledgment, explanation, non-repeat, tactics, narrative, trust-after-error)
    DelegationModule, // ⚖️ Camada XIII — Delegation Confidence Tracking (state tracker, graduation, suggestions, rollback, evidence)
    TrustModule, // 🛡️ Camada IX — Trust Capital Protection (fatigue, desperation, brand, silence, handoff, recovery)
    KloelTeamModule, // 👥 Camada XII — Team Augmentation (pre-call context, next-best-action, forgotten-followup, blind-spot, handoff)
    ColdstartModule, // 🚀 Camada XVII — Cold-Start Discovery (no-history → first truth in ≤30 days)
    CashModule, // 💰 Camada XXII — Cash Protection (track, project, runway, risk, volatility, protective actions, unsafe operation blocking)
    HypproofModule, // 🧪 Camada XX — Hypothesis → Experiment → Proof → Belief → Narrative (UTP-HYPPROOF-001..008)
    PostsaleConsumersModule, // 📦 Camada XVIII — Post-Sale & LTV Engine (anti-remorse, activation, LV, churn, retention, win-back, LTV)
    WisdomModule, // 🧠 Camada VI — Cross-Workspace Commercial Wisdom (k-anonymity, diff-privacy, patterns)
    WowModule, // ⚡ Camada XI — First-Hour Wow (cold-start ingestion, pattern detection, evidence delivery)
    HealthyMoneyModule, // 💰 Camada XIX — Healthy Money Optimization (revenue quality, margin, refund risk, brand wear, sale blocking)
    AgencyModule, // 🏢 Camada XXV — Agency Intelligence (portfolio state, per-client context, priority ranking, margin, churn risk, load balance, knowledge leak guard, handoff)
    ClarityModule, // 🎯 Camada XX — Clarity Cognitive Prioritization (attention ranking, hierarchy projection, noise filter, anxiety detection, feedback loop, short narrative)
    CommemModule, // 🧠 Camada XXI — Commem: Memory Exporter (ledger aggregation, memory projection, capsule export, time machine, value quantification, narrative, attribution guard)
    CreatorModule, // 🎬 Camada XXVI — Creator Intelligence (audience-partner fit, mention timing, saturation, authenticity, engagement-vs-conversion, trust capital)
    RoleModule, // 🎭 Camada XXIII — Role-Aware Commercial Intelligence (role detection, leverage map, recommendation guard, multi-hat, hierarchy/wisdom extenders) (UTP-ROLE-001..008)
    AffilModule, // 🤝 Camada XXIII — Affiliate Intelligence & Protection (offer quality, producer trust, audience fit, angle, fatigue, waste, budget, account, commission, switch, scale vs abandon, discovery loop) (UTP-AFFIL-001..012)
    MoveModule, // 🏃 Camada XXXI — Real Movement (friction detection, step decomposition, tiny action suggestion, partial execution, alternative routes, pattern learning, no-blame tone) (UTP-MOVE-001..007)
    ChannelModule, // 📡 Camada XXVIII — Channel Survival Intelligence (concentration, health, ban-risk, policy, contingency, migration, diversification)
    ChannelPolicyModule, // 📋 Per-channel terminal valence + truthMode policy registry
    DefensModule, // 🛡️ Camada 30 — Defensibility Assets (asset registry, growth, owned audience, social proof, case library, positioning, authority, tradeoffs, narrative)
    EvolModule, // 🧬 Camada XXXII — Self-Evolution (gap detection, proposals, human authorization, agent dispatch, experiment runner, rollback, firewall, codacy enforcement, audit)
    IncentModule, // 🤝 Camada XXXIV — Incentive Integrity (explain, detect conflict, silence, monitor bias, disclose, audit, feedback, attribution)
    EcosysModule, // 🤝 Camada XXVII — Ecosystem Intelligence (cross-role fits, privacy guard, conflict detector, suggestion delivery)
    LegitModule, // ⚖️ Camada LEGIT — Legal & Regulatory Compliance (LGPD/GDPR/CCPA, policies, consent, regulated content, image rights, risk flags, legal consult)
    PulseModule, // PULSE live organism collector
    VtierModule, // V-tier certification — V1..V16 runtime verification (cognitive organism)
    AnunciosModule, // 📊 Anuncios — Meta/Google/TikTok ad accounts, campaigns, insights
    TikTokAdsModule, // 🎵 TikTok Ads — OAuth + Events API + sync
    AdminModule, // adm.kloel.com identity, audit, permissions (SP-0..2)
    PaymentsModule, // 💳 Stripe Connect — split, ledger, fraud, charge, webhook (FASES 1-7)
    MarketplaceTreasuryModule, // 💼 Marketplace treasury ledger / reconciliation
    WalletModule, // ⚡ Prepaid wallet for usage-metered services (FASE 4)
    UnsubscribeModule, // ✉️ Token-signed unsubscribe endpoint (LGPD/GDPR)
    IdempotencyModule, // 🔁 Idempotency middleware + service
    ObservabilityModule, // 🔍 Correlation-id + OpenTelemetry spans
  ],
  controllers: [AppController, PaymentWebhookStripeController, PaymentWebhookGenericController],
  providers: [
    AppService,
    AlertsGateway,
    StripeWebhookLedgerService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // Enabled JwtAuthGuard
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard, // Enabled RolesGuard
    },
    {
      provide: APP_GUARD,
      useClass: RouteClassGuard,
    },
    {
      provide: APP_GUARD,
      useClass: IdempotencyGuard,
    },
    // PR P3-1: order matters. RequestIdInterceptor must run first
    // because every other interceptor reads `req.id`. Before P3-1
    // RequestId was second, so MetricsInterceptor saw `req.id`
    // undefined and downstream interceptors generated their own
    // independent UUIDs (three different IDs for the same request).
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestIdInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpTracingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggerInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  /** Configure. */
  configure(consumer: MiddlewareConsumer) {
    // Sanitiza inputs de texto em rotas de IA para prevenir prompt injection
    consumer
      .apply(PromptSanitizerMiddleware)
      .forRoutes(
        'kloel/agent/*path',
        'kloel/onboarding/*path',
        'kloel/chat/*path',
        'copilot/*path',
        'autopilot/*path',
      );
    consumer.apply(IdempotencyMiddleware).forRoutes('*path');
    consumer.apply(CorrelationIdMiddleware).forRoutes('*path');
    consumer.apply(AuditLogMiddleware).forRoutes('*path');
  }
}
