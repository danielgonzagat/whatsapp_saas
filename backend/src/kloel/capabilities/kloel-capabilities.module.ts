import { Module } from '@nestjs/common';
import { KloelCapabilitiesService } from './kloel-capabilities.service';
import { PromptRefinerCapability } from './prompt-refiner.capability';
import { ResponseDepthAdvisorCapability } from './response-depth-advisor.capability';
import { StructuredTextExtractorCapability } from './structured-text-extractor.capability';

/**
 * KloelCapabilitiesModule — bundles the self-contained chat "thinking tools".
 *
 * Import this module wherever the chat/agent runtime needs to invoke the
 * deterministic capabilities (structured-text extraction, response-depth advice,
 * prompt refining). Exports `KloelCapabilitiesService` as the single entry point.
 */
@Module({
  providers: [
    StructuredTextExtractorCapability,
    ResponseDepthAdvisorCapability,
    PromptRefinerCapability,
    KloelCapabilitiesService,
  ],
  exports: [KloelCapabilitiesService],
})
export class KloelCapabilitiesModule {}
