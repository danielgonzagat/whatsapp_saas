import { Injectable, Logger } from '@nestjs/common';
import type { IntentClassification } from '../capability-registry-v2/capability-registry-v2.types';
import { CapabilityRegistryV2Service } from '../capability-registry-v2/capability-registry-v2.service';
import { INTENT_PATTERNS, isCardPaymentMention, type IntentPattern } from './intent-router.helpers';

/**
 * Intent Router — deterministic pre-LLM classification layer.
 *
 * Every user message passes through this router BEFORE reaching the LLM.
 * The LLM never decides whether to call a tool. The router classifies the
 * intent, and if it matches a known capability, the ToolPlanner takes over.
 *
 * This implements Principle 2.1 of the Kloel Organism mission:
 * "Roteador determinístico antes do LLM."
 *
 * The pattern catalogue lives in `intent-router.helpers.ts` to keep this
 * service focused on orchestration / classification and the pattern data
 * independently testable.
 */
@Injectable()
export class IntentRouterService {
  private readonly logger = new Logger(IntentRouterService.name);

  // Pattern-based matchers for high-confidence intents — pure data, see helpers.
  private readonly PATTERNS: IntentPattern[] = INTENT_PATTERNS;

  constructor(private readonly registry: CapabilityRegistryV2Service) {}

  /**
   * Classify a user message into an intent.
   *
   * Three-stage classification:
   * 1. Pattern matching (regex/keywords) — highest confidence
   * 2. Registry-based keyword scoring — fallback
   * 3. Chat — no capability matched
   */
  classify(
    message: string,
    surface: string,
    permissions: string[],
  ): { classification?: IntentClassification; isChat: boolean } {
    const startTime = Date.now();
    const normalized = message.trim();

    if (!normalized) {
      return { isChat: true };
    }

    // Stage 1: Pattern matching
    for (const pattern of this.PATTERNS) {
      const match = normalized.match(pattern.regex);
      if (match) {
        const cap = this.registry.get(pattern.capabilityId);
        if (!cap) {
          continue;
        }

        const entities = pattern.extract(match);
        const missingInputs = cap.inputSchema
          .filter((f) => f.required && !entities[f.key])
          .map((f) => f.key);

        this.logger.debug(
          `Intent matched pattern: "${pattern.capabilityId}" in ${Date.now() - startTime}ms`,
        );

        return {
          classification: {
            intent: pattern.capabilityId,
            capabilityId: pattern.capabilityId,
            entities,
            confidence: 0.9,
            missingInputs,
            requiresConfirmation: cap.requiresConfirmation,
          },
          isChat: false,
        };
      }
    }

    if (isCardPaymentMention(normalized)) {
      return { isChat: true };
    }

    // Stage 2: Registry-based classification
    const registryResult = this.registry.classifyIntent(normalized, surface, permissions);
    if (registryResult && registryResult.confidence >= 0.5) {
      return { classification: registryResult, isChat: false };
    }

    // Stage 3: Chat — no capability matched
    return { isChat: true };
  }
}
