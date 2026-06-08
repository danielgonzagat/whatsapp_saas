import { Injectable } from '@nestjs/common';
import { CapabilityRegistryV2Service } from '../capability-registry-v2/capability-registry-v2.service';
import type {
  CapabilityCategory,
  CapabilityDefinition,
} from '../capability-registry-v2/capability-registry-v2.types';
import type {
  CapabilityManifest,
  CapabilityManifestEntry,
  CapabilityManifestInput,
  CapabilityManifestObligation,
  CapabilitySafetyLevel,
  CapabilitySafetyProfile,
} from './capability-manifest.types';

const MANIFEST_VERSION = 1;

/** Strip leading "DEPRECATED — " markers and collapse whitespace. */
const DEPRECATED_PREFIX_RE = /^deprecated\b[\s—:-]*/i;
const WHITESPACE_RE = /\s+/g;
const NON_WORD_SPLIT_RE = /[^\p{L}\p{N}]+/u;

/**
 * Always-on journey obligations. These are NOT registry capabilities — they are
 * the mandatory contract the factory imposes on every turn (truthfulness, no
 * fabricated receipts, hidden internals). Authored here, not in the registry,
 * because they constrain the model rather than describe an invocable action.
 */
const FACTORY_OBLIGATIONS: readonly CapabilityManifestObligation[] = [
  {
    id: 'obligation.no-fabrication',
    instruction:
      'Nunca invente resultados, recibos, valores ou confirmações. Só afirme que uma ação foi executada quando houver um evento/recibo real de execução.',
    rationale:
      'Prevents hallucinated side-effects; only real model/agent execution events may be reported as done.',
  },
  {
    id: 'obligation.hidden-internals',
    instruction:
      'Não exponha nomes internos de ferramentas, ids de capacidade ou detalhes de implementação ao usuário. Fale em termos do que foi feito, não de como o sistema chama a ação.',
    rationale:
      'Enforces hiddenFromUser: internalName / capability ids must never leak into user-visible text.',
  },
  {
    id: 'obligation.confirm-sensitive',
    instruction:
      'Antes de executar ações sensíveis (dinheiro, documentos, conta, plano), confirme explicitamente com o usuário o que será feito.',
    rationale:
      'Mirrors registry requiresConfirmation; sensitive mutations may not be silently performed.',
  },
] as const;

/**
 * CAPABILITY MANIFEST BUILDER — derives the model-facing manifest from the
 * canonical {@link CapabilityRegistryV2Service}.
 *
 * This service is purely derivational: it reads the registry and projects each
 * `CapabilityDefinition` into a {@link CapabilityManifestEntry}. It never
 * mutates the registry and owns no capability data of its own (apart from the
 * factory obligations, which are model-constraints, not invocable actions).
 *
 * Disjoint by design: the registry stays the single source of execution truth;
 * this builder is the read-only manifest view consumed by the router and the
 * manifest-injection assembler.
 */
@Injectable()
export class CapabilityManifestBuilderService {
  constructor(private readonly registry: CapabilityRegistryV2Service) {}

  /**
   * Build the full factory manifest from the live registry. Deterministic for a
   * given registry state — safe to call per turn (the registry list is a cheap
   * in-memory array) or to memoize upstream.
   */
  build(): CapabilityManifest {
    const capabilities = this.registry.list().map((definition) => this.toEntry(definition));
    return {
      version: MANIFEST_VERSION,
      capabilities,
      obligations: [...FACTORY_OBLIGATIONS],
    };
  }

  /** Project a single registry definition into a manifest entry. */
  private toEntry(definition: CapabilityDefinition): CapabilityManifestEntry {
    return {
      id: definition.id,
      internalName: definition.id,
      description: this.cleanDescription(definition),
      triggers: this.deriveTriggers(definition),
      inputs: definition.inputSchema.map((field): CapabilityManifestInput => {
        const input: CapabilityManifestInput = {
          key: field.key,
          type: field.type,
          required: field.required,
        };
        if (field.enum !== undefined) {
          return { ...input, enum: field.enum };
        }
        return input;
      }),
      outputs: [...definition.emits],
      safetyProfile: this.deriveSafetyProfile(definition),
      hiddenFromUser: true,
      category: definition.category,
      maturity: definition.maturity ?? 'registry',
      surface: [...definition.surface],
      dependsOn: [...(definition.dependsOn ?? [])],
    };
  }

  /** Registry description, with the noisy DEPRECATED marker normalized away. */
  private cleanDescription(definition: CapabilityDefinition): string {
    const raw = definition.description.replace(WHITESPACE_RE, ' ').trim();
    const withoutMarker = raw.replace(DEPRECATED_PREFIX_RE, '').trim();
    return withoutMarker.length > 0 ? withoutMarker : definition.title;
  }

  /**
   * Lowercase routing keywords: id segments, title words, and input labels.
   * Dotted/underscored ids are split so `workspace.toggle_autopilot` yields
   * `workspace`, `toggle`, `autopilot`.
   */
  private deriveTriggers(definition: CapabilityDefinition): string[] {
    const sources = [
      definition.id,
      definition.title,
      ...definition.inputSchema.map((field) => field.label),
    ];
    const tokens = new Set<string>();
    for (const source of sources) {
      for (const part of source.toLowerCase().split(NON_WORD_SPLIT_RE)) {
        const token = part.trim();
        if (token.length >= 3) {
          tokens.add(token);
        }
      }
    }
    return [...tokens];
  }

  /** Map registry category + confirmation flag onto the manifest safety model. */
  private deriveSafetyProfile(definition: CapabilityDefinition): CapabilitySafetyProfile {
    return {
      level: this.deriveSafetyLevel(definition.category),
      requiresConfirmation: definition.requiresConfirmation,
      requiredPermissions: [...definition.requiredPermissions],
    };
  }

  private deriveSafetyLevel(category: CapabilityCategory): CapabilitySafetyLevel {
    switch (category) {
      case 'MUTATION_SENSITIVE':
        return 'sensitive_mutation';
      case 'MUTATION_SAFE':
      case 'CONFIGURATION':
        return 'safe_mutation';
      case 'COMMUNICATION':
        return 'communication';
      case 'QUERY':
      case 'SELF_AWARENESS':
      case 'META':
        return 'read_only';
    }
  }
}
