import { Injectable, Logger } from '@nestjs/common';
import {
  type CapabilityDefinition,
  type ExecutionReceipt,
  type CapabilityContext,
} from '../capability-registry-v2/capability-registry-v2.types';
/**
 * ToolPlanner — bridges IntentRouter classification with existing tool execution.
 *
 * Responsibilities:
 * 1. Validate inputs against capability schema
 * 2. Ask for missing inputs
 * 3. Generate confirmation requests for sensitive actions
 * 4. Execute via existing tool dispatcher
 * 5. Build ExecutionReceipt for every action
 */
@Injectable()
export class ToolPlannerService {
  private readonly logger = new Logger(ToolPlannerService.name);
  constructor(
  ) {}
  /**
   * Validate inputs against a capability's schema.
   * Returns missing required fields.
   */
  validateInputs(
    cap: CapabilityDefinition,
    inputs: Record<string, unknown>,
  ): { valid: boolean; missing: string[]; prompts: string[] } {
    const missing: string[] = [];
    const prompts: string[] = [];

    for (const field of cap.inputSchema) {
      const value = inputs[field.key];
      const isEmpty = value === undefined || value === null || value === '';

      if (field.required && isEmpty) {
        missing.push(field.key);
        if (field.prompt) {
          prompts.push(field.prompt);
        } else {
          prompts.push(`${field.label}?`);
        }
      }
    }

    return { valid: missing.length === 0, missing, prompts };
  }
  /**
   * Validate specific input types (number, boolean, enum).
   */
  coerceInputs(
    cap: CapabilityDefinition,
    inputs: Record<string, unknown>,
  ): Record<string, unknown> {
    const coerced = { ...inputs };

    for (const field of cap.inputSchema) {
      const value = coerced[field.key];
      if (value === undefined || value === null) continue;

      switch (field.type) {
        case 'number': {
          if (typeof value === 'string') {
            coerced[field.key] = parseFloat(value.replace(',', '.'));
          }
          break;
        }
        case 'boolean': {
          if (typeof value === 'string') {
            coerced[field.key] = value.toLowerCase() === 'sim' || value === 'true' || value === '1';
          }
          break;
        }
        case 'select': {
          if (field.enum && typeof value === 'string') {
            // Normalize: try to match first letter or whole word
            const normalized = value.toLowerCase().trim();
            const match = field.enum.find(
              (opt) =>
                opt.toLowerCase() === normalized ||
                opt.toLowerCase().startsWith(normalized) ||
                opt[0]?.toLowerCase() === normalized[0],
            );
            if (match) coerced[field.key] = match;
          }
          break;
        }
      }
    }

    return coerced;
  }
  /**
   * Build a human-readable confirmation summary from capability + inputs.
   */
  buildConfirmationSummary(cap: CapabilityDefinition, inputs: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const field of cap.inputSchema) {
      const value = inputs[field.key];
      if (value !== undefined && value !== null && value !== '') {
        parts.push(`${field.label}: ${value}`);
      }
    }
    return `${cap.title}: ${parts.join(', ')}`;
  }
  /**
   * Create an ExecutionReceipt from capability execution.
   */
  buildReceipt(
    cap: CapabilityDefinition,
    ctx: CapabilityContext,
    inputs: Record<string, unknown>,
    outputs: Record<string, unknown>,
    startedAt: number,
  ): ExecutionReceipt {
    const durationMs = Date.now() - startedAt;
    const auditLogId = `audit_${ctx.requestId}`;

    const evidenceUrl = cap.evidenceUrlBuilder
      ? cap.evidenceUrlBuilder.replace('${productId}', String(outputs.productId || ''))
          .replace('${orderId}', String(outputs.orderId || ''))
          .replace('${planId}', String(outputs.planId || ''))
      : undefined;

    return {
      capabilityId: cap.id,
      title: cap.title,
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorId,
      inputs,
      outputs,
      domainEvents: cap.emits,
      auditLogId,
      evidenceUrl,
      timestamp: new Date().toISOString(),
      durationMs,
      idempotencyKey: ctx.idempotencyKey,
      success: true,
    };
  }
  /**
   * Build a receipt for a failed execution.
   */
  buildErrorReceipt(
    cap: CapabilityDefinition,
    ctx: CapabilityContext,
    inputs: Record<string, unknown>,
    error: string,
    startedAt: number,
  ): ExecutionReceipt {
    const durationMs = Date.now() - startedAt;
    return {
      capabilityId: cap.id,
      title: cap.title,
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorId,
      inputs,
      outputs: { error },
      domainEvents: [],
      auditLogId: `audit_fail_${ctx.requestId}`,
      timestamp: new Date().toISOString(),
      durationMs,
      idempotencyKey: ctx.idempotencyKey,
      success: false,
      error,
    };
  }
  /**
   * Verbalize a receipt into a human-readable message (PT-BR).
   */
  verbalizeReceipt(receipt: ExecutionReceipt): string {
    if (!receipt.success) {
      return `Falha ao executar "${receipt.title}": ${receipt.error}`;
    }

    const lines: string[] = [`✅ ${receipt.title} executado com sucesso.`];

    if (receipt.outputs.productId) {
      lines.push(`Produto: ${receipt.outputs.productId}`);
    }
    if (receipt.outputs.planId) {
      lines.push(`Plano: ${receipt.outputs.planId}`);
    }
    if (receipt.outputs.orderId) {
      lines.push(`Venda: ${receipt.outputs.orderId}`);
    }
    if (receipt.outputs.paymentLink) {
      lines.push(`Link: ${receipt.outputs.paymentLink}`);
    }
    if (receipt.outputs.pixCopyPaste) {
      lines.push(`PIX copia e cola: ${receipt.outputs.pixCopyPaste}`);
    }
    if (receipt.evidenceUrl) {
      lines.push(`Ver em: ${receipt.evidenceUrl}`);
    }

    lines.push(`Registro: ${receipt.auditLogId}`);
    lines.push(`Duração: ${receipt.durationMs}ms`);

    return lines.join('\n');
  }
  /**
   * Log an action to the audit system.
   */
  async logAuditEntry(
    receipt: ExecutionReceipt,
  ): Promise<void> {
    this.logger.log(
      `[AUDIT] ${receipt.success ? 'OK' : 'FAIL'} ${receipt.capabilityId} ` +
      `ws=${receipt.workspaceId} duration=${receipt.durationMs}ms ` +
      `key=${receipt.idempotencyKey}`,
    );
  }
}
