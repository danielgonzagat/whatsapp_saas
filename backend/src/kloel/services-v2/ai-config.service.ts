import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../../logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';

export interface AIConfigUpdateArgs {
  model?: string;
  temperature?: number;
  systemPrompt?: string;
  maxTokens?: number;
  [key: string]: unknown;
}

/**
 * AIConfigService — workspace-level AI configuration.
 *
 * domainService alias: AIConfigService.update
 * Workspace isolation: every mutation scoped to workspaceId.
 *
 * Stores AI config in workspace.providerSettings JSON under the "aiConfig" key.
 */
@Injectable()
export class AIConfigService {
  private readonly logger = StructuredLogger.from(AIConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Update workspace-level AI config. */
  async update(
    workspaceId: string,
    args: AIConfigUpdateArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const current =
      ws?.providerSettings && typeof ws.providerSettings === 'object'
        ? (ws.providerSettings as Record<string, unknown>)
        : {};

    const currentAi =
      current.aiConfig && typeof current.aiConfig === 'object'
        ? (current.aiConfig as Record<string, unknown>)
        : {};

    const patch: Record<string, unknown> = {};
    if (args.model !== undefined) patch.model = String(args.model);
    if (args.temperature !== undefined) patch.temperature = Number(args.temperature);
    if (args.systemPrompt !== undefined) patch.systemPrompt = String(args.systemPrompt);
    if (args.maxTokens !== undefined) patch.maxTokens = Number(args.maxTokens);

    const merged = { ...currentAi, ...patch };
    const updatedSettings = { ...current, aiConfig: merged };

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { providerSettings: updatedSettings as Prisma.InputJsonValue },
    });

    this.logger.log(`AIConfigService.update workspace=${workspaceId}`, patch);
    return { success: true, data: merged };
  }
}
