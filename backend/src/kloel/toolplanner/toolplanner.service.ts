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
function outputString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

@Injectable()
export class ToolPlannerService {
  private readonly logger = new Logger(ToolPlannerService.name);
  constructor() {}
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
      if (value === undefined || value === null) {
        continue;
      }

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
            if (match) {
              coerced[field.key] = match;
            }
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
        const text = outputString(value);
        if (text) {
          parts.push(`${field.label}: ${text}`);
        }
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
      ? cap.evidenceUrlBuilder
          .replace('${productId}', outputString(outputs.productId))
          .replace('${orderId}', outputString(outputs.orderId))
          .replace('${planId}', outputString(outputs.planId))
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
      ...(evidenceUrl !== undefined ? { evidenceUrl } : {}),
      ...(cap.executionRail !== undefined ? { executionRail: cap.executionRail } : {}),
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
      ...(cap.executionRail !== undefined ? { executionRail: cap.executionRail } : {}),
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
    const productId = outputString(receipt.outputs.productId);
    const planId = outputString(receipt.outputs.planId);
    const orderId = outputString(receipt.outputs.orderId);
    const paymentLink = outputString(receipt.outputs.paymentLink);

    if (productId) {
      lines.push(`Produto: ${productId}`);
    }
    if (planId) {
      lines.push(`Plano: ${planId}`);
    }
    if (orderId) {
      lines.push(`Venda: ${orderId}`);
    }
    if (paymentLink) {
      lines.push(`Link: ${paymentLink}`);
    }
    const pixCopyPaste = outputString(
      receipt.outputs.pixCopiaECola || receipt.outputs.pixCopyPaste,
    );
    if (pixCopyPaste) {
      lines.push(`PIX copia e cola: ${pixCopyPaste}`);
    }
    const pixQrCode = outputString(receipt.outputs.pixQrCode || receipt.outputs.qrCodeBase64);
    if (pixQrCode) {
      lines.push(`QR Code PIX: ${pixQrCode}`);
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
  logAuditEntry(receipt: ExecutionReceipt): void {
    this.logger.log(
      `[AUDIT] ${receipt.success ? 'OK' : 'FAIL'} ${receipt.capabilityId} ` +
        `ws=${receipt.workspaceId} duration=${receipt.durationMs}ms ` +
        `key=${receipt.idempotencyKey}`,
    );
  }
}
