import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../../logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';
import { ChannelMessageDispatchService } from '../../marketing/channel-message-dispatch.service';

export interface ChannelListArgs {
  [key: string]: unknown;
}

export interface ChannelConnectArgs {
  channel: string;
  credentials?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ChannelSendArgs {
  channel: string;
  to: string;
  message: string;
  [key: string]: unknown;
}

/**
 * ChannelService — lists connected channels and sends messages via OmniCore.
 *
 * domainService aliases:
 *   - ChannelService.list    → lists workspace integrations + channel identifiers
 *   - ChannelService.connect → upserts an Integration record for a channel
 *   - ChannelService.send    → delegates to ChannelMessageDispatchService.dispatch
 *
 * Workspace isolation: all operations filter by workspaceId.
 */
@Injectable()
export class ChannelService {
  private readonly logger = StructuredLogger.from(ChannelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: ChannelMessageDispatchService,
  ) {}

  /** List all active channel integrations for the workspace. */
  async list(
    workspaceId: string,
    _args: ChannelListArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const integrations = await this.prisma.integration.findMany({
      where: { workspaceId, isActive: true },
      select: {
        id: true,
        type: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { type: 'asc' },
    });

    this.logger.log(`ChannelService.list ws=${workspaceId} count=${integrations.length}`);
    return { success: true, data: integrations };
  }

  /**
   * Connect (upsert) a channel integration for the workspace.
   * Credentials are stored encrypted in the Integration.credentials JSON field.
   * Sensitive values are NOT logged.
   */
  async connect(
    workspaceId: string,
    args: ChannelConnectArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const channel = String(args.channel ?? '').toUpperCase();
    if (!channel) {
      return { success: false, data: null };
    }

    const credentials = args.credentials ?? {};
    const name = String(args.name ?? channel);

    const existing = await this.prisma.integration.findFirst({
      where: { workspaceId, type: channel },
      select: { id: true },
    });

    const credJson = credentials as Prisma.InputJsonValue;
    let result;
    if (existing) {
      result = await this.prisma.integration.update({
        where: { id: existing.id },
        data: { credentials: credJson, isActive: true, name },
        select: { id: true, type: true, name: true, isActive: true },
      });
    } else {
      result = await this.prisma.integration.create({
        data: { workspaceId, type: channel, name, credentials: credJson, isActive: true },
        select: { id: true, type: true, name: true, isActive: true },
      });
    }

    this.logger.log(`ChannelService.connect ws=${workspaceId} channel=${channel}`);
    return { success: true, data: result };
  }

  /** Send a message through a channel via ChannelMessageDispatchService. */
  async send(
    workspaceId: string,
    args: ChannelSendArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const channel = String(args.channel ?? '');
    const to = String(args.to ?? '');
    const message = String(args.message ?? '');

    if (!channel || !to || !message) {
      return { success: false, data: null };
    }

    const result = await this.dispatch.dispatch(workspaceId, channel, to, message);
    this.logger.log(`ChannelService.send ws=${workspaceId} channel=${channel} to=${to}`);
    return { success: result.success, data: result };
  }
}
