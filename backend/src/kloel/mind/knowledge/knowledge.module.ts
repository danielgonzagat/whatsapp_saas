import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AgentAssistService } from './agent-assist.service';
import { HiddenDataExtractorService } from './hidden-data.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { MediaFactoryService } from './media-factory.service';
import { VectorService } from './vector.service';

import { BillingModule } from '../../../billing/billing.module';
import { WalletModule } from '../../../wallet/wallet.module';

/**
 * Mind/Knowledge module — NestJS wiring for the canonical knowledge layer.
 *
 * Physically moved from `backend/src/ai-brain/ai-brain.module.ts` to its
 * canonical location under `kloel/mind/knowledge/` per ADR-0013 Wave M2
 * (2026-05-27). This is the final piece of the `ai-brain/` retirement —
 * the legacy folder is now fully empty and deleted.
 *
 * The legacy class name `AiBrainModule` is preserved as a backward-compat
 * alias export so any out-of-tree importers (none known in-tree) keep
 * compiling without churn.
 *
 * @cluster Mind/Knowledge
 * @see docs/adr/0013-kloel-mind-unification.md
 */
@Module({
  imports: [ConfigModule, PrismaModule, BillingModule, WalletModule],
  controllers: [KnowledgeBaseController],
  providers: [
    KnowledgeBaseService,
    VectorService,
    AgentAssistService,
    HiddenDataExtractorService,
    MediaFactoryService,
  ],
  exports: [
    KnowledgeBaseService,
    VectorService,
    AgentAssistService,
    HiddenDataExtractorService,
    MediaFactoryService,
  ],
})
export class MindKnowledgeModule {}

/**
 * Backward-compat alias for the legacy `AiBrainModule` class name.
 * Prefer importing `MindKnowledgeModule` directly in new code.
 *
 * @deprecated Use `MindKnowledgeModule` instead.
 */
export { MindKnowledgeModule as AiBrainModule };
