import { Injectable, Logger } from '@nestjs/common';
import {
  type CapabilityDefinition,
  type CapabilityMaturity,
  type ExecutionReceipt,
  type IntentClassification,
  type ConfirmationRequest,
  type CapabilityContext,
} from './capability-registry-v2.types';import { CAPABILITY_DEFINITIONS, CAPABILITY_MAP } from './capability-registry-v2.const';

/**
 * Capability Registry v2 — Single source of truth for all Kloel capabilities.
 *
 * This replaces the old CapabilityRegistryService (which only tracked maturity)
 * and consolidates all capability definitions into one place.
 *
 * Responsibilities:
 * - Register and catalog all capabilities
 * - Filter capabilities by permissions/context
 * - Classify intents and validate inputs
 * - Generate receipts for executed actions
 */
@Injectable()
export class CapabilityRegistryV2Service {
  private readonly logger = new Logger(CapabilityRegistryV2Service.name);
  private readonly maturities = new Map<string, CapabilityMaturity>();

  constructor() {
    for (const cap of CAPABILITY_DEFINITIONS) {
      this.maturities.set(cap.id, cap.maturity ?? 'registry');
    }
    this.logger.log(`CapabilityRegistry v2 initialized with ${CAPABILITY_DEFINITIONS.length} capabilities`);
  }

  list(): CapabilityDefinition[] {
    return [...CAPABILITY_DEFINITIONS];
  }

  get(id: string): CapabilityDefinition | undefined {
    return CAPABILITY_MAP.get(id);
  }

  getMaturity(id: string): CapabilityMaturity | undefined {
    return this.maturities.get(id);
  }

  setMaturity(id: string, maturity: CapabilityMaturity): void {
    this.maturities.set(id, maturity);
  }

  filterForSurface(surface: string): CapabilityDefinition[] {
    return CAPABILITY_DEFINITIONS.filter(
      (cap) => cap.surface.includes(surface) || cap.surface.includes('*'),
    );
  }

  filterForPermissions(
    caps: CapabilityDefinition[],
    permissions: string[],
  ): CapabilityDefinition[] {
    if (permissions.includes('*')) {return caps;}
    return caps.filter(
      (cap) =>
        cap.requiredPermissions.length === 0 ||
        cap.requiredPermissions.some((p) => permissions.includes(p)),
    );
  }

  filterFor(options: {
    surface: string;
    permissions: string[];
  }): CapabilityDefinition[] {
    const fromSurface = this.filterForSurface(options.surface);
    return this.filterForPermissions(fromSurface, options.permissions);
  }

  groupedByTier(): Record<number, CapabilityDefinition[]> {
    const groups: Record<number, CapabilityDefinition[]> = {};
    for (const cap of CAPABILITY_DEFINITIONS) {
      const entry = groups[cap.tier];
      if (entry) {
        entry.push(cap);
      } else {
        groups[cap.tier] = [cap];
      }
    }
    return groups;
  }

  listGaps(permissions: string[], surface: string): CapabilityDefinition[] {
    const available = this.filterFor({ surface, permissions });
    const ids = new Set(available.map((c) => c.id));
    return CAPABILITY_DEFINITIONS.filter((cap) => !ids.has(cap.id));
  }

  classifyIntent(
    text: string,
    surface: string,
    permissions: string[],
  ): IntentClassification | null {
    const normalized = text.toLowerCase().trim();
    const candidates = this.filterFor({ surface, permissions });

    const scored = candidates.map((cap) => {
      const keywords = [
        cap.id.toLowerCase(),
        cap.title.toLowerCase(),
        ...cap.inputSchema.map((f) => f.label.toLowerCase()),
      ];
      const hits = keywords.filter((k) => normalized.includes(k)).length;
      const confidence = hits > 0 ? Math.min(0.5 + hits * 0.15, 0.95) : 0;
      return { capability: cap, confidence };
    });

    const best = scored.sort((a, b) => b.confidence - a.confidence)[0];
    if (!best || best.confidence < 0.3) {return null;}
    const { capability, confidence } = best;

    const entities: Record<string, unknown> = {};
    for (const field of capability.inputSchema) {
      if (field.type === 'number') {
        const match = normalized.match(/(?:r?\$\s*)?(\d+(?:[.,]\d+)?)/i);
        if (match?.[1]) {entities[field.key] = parseFloat(match[1].replace(',', '.'));}
      }
    }

    const missingInputs = capability.inputSchema
      .filter((f) => f.required && !entities[f.key])
      .map((f) => f.key);

    return {
      intent: capability.id,
      capabilityId: capability.id,
      entities,
      confidence,
      missingInputs,
      requiresConfirmation: capability.requiresConfirmation,
    };
  }

  buildConfirmation(
    cap: CapabilityDefinition,
    inputs: Record<string, unknown>,
  ): ConfirmationRequest {
    const fields = Object.entries(inputs)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    return {
      capabilityId: cap.id,
      title: cap.title,
      summary: `${cap.title}: ${fields}`,
      inputs,
    };
  }

  createReceipt(params: {
    capabilityId: string;
    title: string;
    context: CapabilityContext;
    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;
    domainEvents: string[];
    auditLogId: string;
    evidenceUrl?: string;
    durationMs: number;
    success: boolean;
    error?: string;
  }): ExecutionReceipt {
    return {
      capabilityId: params.capabilityId,
      title: params.title,
      workspaceId: params.context.workspaceId,
      actorId: params.context.actorId,
      inputs: params.inputs,
      outputs: params.outputs,
      domainEvents: params.domainEvents,
      auditLogId: params.auditLogId,
      ...(params.evidenceUrl !== undefined ? { evidenceUrl: params.evidenceUrl } : {}),
      timestamp: new Date().toISOString(),
      durationMs: params.durationMs,
      idempotencyKey: params.context.idempotencyKey,
      success: params.success,
      ...(params.error !== undefined ? { error: params.error } : {}),
    };
  }
}