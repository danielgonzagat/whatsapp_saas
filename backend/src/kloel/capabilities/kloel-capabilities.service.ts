import { Injectable } from '@nestjs/common';
import { PromptRefinerCapability } from './prompt-refiner.capability';
import { ResponseDepthAdvisorCapability } from './response-depth-advisor.capability';
import { StructuredTextExtractorCapability } from './structured-text-extractor.capability';
import type {
  KloelCapabilityName,
  KloelCapabilityResult,
  PromptRefineInput,
  ResponseDepthInput,
  StructuredTextExtractInput,
} from './kloel-capabilities.types';

/**
 * A tool descriptor the chat can advertise to the model (function-calling) and
 * route to the matching capability. Kept provider-agnostic on purpose.
 */
export interface KloelCapabilityDescriptor {
  readonly name: KloelCapabilityName;
  /** PT-BR description shown to the planner/model. */
  readonly description: string;
  /** Whether the capability mutates anything (all three here are read-only). */
  readonly mutating: false;
}

type CapabilityInput = StructuredTextExtractInput | ResponseDepthInput | PromptRefineInput;

/**
 * KloelCapabilitiesService — the single entry point the Kloel chat uses to
 * invoke this module's deterministic, self-contained capabilities.
 *
 * These are real, read-only "thinking tools" (extract structured rows, advise on
 * response depth, refine a vague prompt). They run with zero external provider
 * calls, so the chat can call them inline while reasoning. The unified `invoke`
 * dispatcher validates the capability name and returns a structured result the
 * chat verbalizes in PT-BR.
 */
@Injectable()
export class KloelCapabilitiesService {
  constructor(
    private readonly structuredTextExtractor: StructuredTextExtractorCapability,
    private readonly responseDepthAdvisor: ResponseDepthAdvisorCapability,
    private readonly promptRefiner: PromptRefinerCapability,
  ) {}

  /** Tool descriptors the chat advertises to the model for function-calling. */
  listCapabilities(): readonly KloelCapabilityDescriptor[] {
    return [
      {
        name: 'structured_text_extractor',
        description:
          'Extrai linhas estruturadas (listas, tabelas coladas, CSV) com pontuação de confiança; marca só as linhas que precisam de revisão.',
        mutating: false,
      },
      {
        name: 'response_depth_advisor',
        description:
          'Estima o tamanho do prompt e sugere níveis de profundidade de resposta (25/50/75/100%).',
        mutating: false,
      },
      {
        name: 'prompt_refiner',
        description:
          'Classifica a intenção de um pedido vago, detecta o que falta e devolve um prompt estruturado pronto para uso.',
        mutating: false,
      },
    ];
  }

  /** Returns true when `name` is a capability this service can dispatch. */
  has(name: string): name is KloelCapabilityName {
    return (
      name === 'structured_text_extractor' ||
      name === 'response_depth_advisor' ||
      name === 'prompt_refiner'
    );
  }

  /**
   * Dispatch a capability by name. Throws a typed error for unknown names so the
   * chat can surface a clean message rather than a silent no-op.
   */
  invoke(
    name: 'structured_text_extractor',
    input: StructuredTextExtractInput,
  ): KloelCapabilityResult;
  invoke(name: 'response_depth_advisor', input: ResponseDepthInput): KloelCapabilityResult;
  invoke(name: 'prompt_refiner', input: PromptRefineInput): KloelCapabilityResult;
  invoke(name: KloelCapabilityName, input: CapabilityInput): KloelCapabilityResult;
  invoke(name: KloelCapabilityName, input: CapabilityInput): KloelCapabilityResult {
    switch (name) {
      case 'structured_text_extractor':
        return this.structuredTextExtractor.extract(input as StructuredTextExtractInput);
      case 'response_depth_advisor':
        return this.responseDepthAdvisor.advise(input as ResponseDepthInput);
      case 'prompt_refiner':
        return this.promptRefiner.refine(input as PromptRefineInput);
    }
  }

  /** Direct typed accessors for callers that already know the capability. */
  extractStructuredText(input: StructuredTextExtractInput): KloelCapabilityResult {
    return this.structuredTextExtractor.extract(input);
  }

  adviseResponseDepth(input: ResponseDepthInput): KloelCapabilityResult {
    return this.responseDepthAdvisor.advise(input);
  }

  refinePrompt(input: PromptRefineInput): KloelCapabilityResult {
    return this.promptRefiner.refine(input);
  }
}
