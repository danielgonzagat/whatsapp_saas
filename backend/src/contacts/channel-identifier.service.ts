import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ResolvedContact {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  workspaceId: string;
  channelIdentifierId: string;
  wasCreated: boolean;
}

export interface ChannelIdentifierResult {
  id: string;
  channel: string;
  value: string;
  contactId: string;
  workspaceId: string;
  isPrimary: boolean;
  metadata: Record<string, unknown> | null;
}

const CHANNEL_ALIASES: Record<string, string> = {
  FACEBOOK: 'MESSENGER',
  FB: 'MESSENGER',
  IG: 'INSTAGRAM',
};

const VALID_CHANNELS = new Set(['WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'EMAIL', 'TIKTOK']);

export function normalizeChannelIdentifierChannel(channel: string): string {
  const normalized = String(channel || '')
    .trim()
    .toUpperCase();
  const aliased = CHANNEL_ALIASES[normalized] ?? normalized;
  if (!VALID_CHANNELS.has(aliased)) {
    throw new Error(`Unsupported channel identifier channel: ${channel}`);
  }
  return aliased;
}

function normalizeMetadata(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value;
}

function toChannelIdentifierResult(identifier: {
  id: string;
  channel: string;
  value: string;
  contactId: string;
  workspaceId: string;
  isPrimary: boolean;
  metadata: Prisma.JsonValue | null;
}): ChannelIdentifierResult {
  return {
    id: identifier.id,
    channel: identifier.channel,
    value: identifier.value,
    contactId: identifier.contactId,
    workspaceId: identifier.workspaceId,
    isPrimary: identifier.isPrimary,
    metadata: normalizeMetadata(identifier.metadata),
  };
}

@Injectable()
export class ChannelIdentifierService {
  private readonly logger = new Logger(ChannelIdentifierService.name);

  constructor(private readonly prisma: PrismaService) {}

  resolve(
    channel: string,
    value: string,
    workspaceId: string,
    options?: { name?: string; isPrimary?: boolean; metadata?: Record<string, unknown> },
  ): Promise<ResolvedContact> {
    return this.resolveWithClient(this.prisma, channel, value, workspaceId, options);
  }

  private async resolveWithClient(
    client: PrismaService | Prisma.TransactionClient,
    channel: string,
    value: string,
    workspaceId: string,
    options?: { name?: string; isPrimary?: boolean; metadata?: Record<string, unknown> },
  ): Promise<ResolvedContact> {
    const normalizedChannel = normalizeChannelIdentifierChannel(channel);
    const existing = await client.channelIdentifier.findUnique({
      where: {
        workspaceId_channel_value: { workspaceId, channel: normalizedChannel, value },
      },
      include: { contact: true },
    });

    if (existing) {
      return {
        id: existing.contact.id,
        phone: existing.contact.phone,
        name: existing.contact.name,
        email: existing.contact.email,
        workspaceId: existing.contact.workspaceId,
        channelIdentifierId: existing.id,
        wasCreated: false,
      };
    }

    const contact = await client.contact.create({
      data: {
        workspaceId,
        phone: `${normalizedChannel.toLowerCase()}:${value}`,
        name: options?.name || null,
      },
    });

    const identifier = await client.channelIdentifier.create({
      data: {
        channel: normalizedChannel,
        value,
        contactId: contact.id,
        workspaceId,
        isPrimary: options?.isPrimary ?? true,
        metadata: options?.metadata ? (options.metadata as Prisma.JsonObject) : undefined,
      },
    });

    return {
      id: contact.id,
      phone: contact.phone,
      name: contact.name,
      email: contact.email,
      workspaceId: contact.workspaceId,
      channelIdentifierId: identifier.id,
      wasCreated: true,
    };
  }

  async linkIdentifier(
    channel: string,
    value: string,
    contactId: string,
    workspaceId: string,
    options?: { isPrimary?: boolean; metadata?: Record<string, unknown> },
  ): Promise<ChannelIdentifierResult> {
    const normalizedChannel = normalizeChannelIdentifierChannel(channel);
    const existing = await this.prisma.channelIdentifier.findUnique({
      where: {
        workspaceId_channel_value: { workspaceId, channel: normalizedChannel, value },
      },
    });

    if (existing) {
      if (existing.contactId === contactId) {
        return toChannelIdentifierResult(existing);
      }
      throw new Error(
        `Channel identifier ${channel}:${value} is already linked to contact ${existing.contactId}`,
      );
    }

    const created = await this.prisma.channelIdentifier.create({
      data: {
        channel: normalizedChannel,
        value,
        contactId,
        workspaceId,
        isPrimary: options?.isPrimary ?? false,
        metadata: options?.metadata ? (options.metadata as Prisma.JsonObject) : undefined,
      },
    });
    return toChannelIdentifierResult(created);
  }

  async findByContact(workspaceId: string, contactId: string): Promise<ChannelIdentifierResult[]> {
    const identifiers = await this.prisma.channelIdentifier.findMany({
      where: { workspaceId, contactId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    return identifiers.map(toChannelIdentifierResult);
  }

  async findContactByChannel(
    channel: string,
    value: string,
    workspaceId: string,
  ): Promise<ResolvedContact | null> {
    const normalizedChannel = normalizeChannelIdentifierChannel(channel);
    const identifier = await this.prisma.channelIdentifier.findUnique({
      where: {
        workspaceId_channel_value: { workspaceId, channel: normalizedChannel, value },
      },
      include: { contact: true },
    });

    if (!identifier) {
      return null;
    }

    return {
      id: identifier.contact.id,
      phone: identifier.contact.phone,
      name: identifier.contact.name,
      email: identifier.contact.email,
      workspaceId: identifier.contact.workspaceId,
      channelIdentifierId: identifier.id,
      wasCreated: false,
    };
  }

  async setPrimary(workspaceId: string, identifierId: string): Promise<void> {
    const identifier = await this.prisma.channelIdentifier.findFirst({
      where: { id: identifierId, workspaceId },
    });

    if (!identifier) {
      throw new Error(`Channel identifier ${identifierId} not found`);
    }

    await this.prisma.$transaction([
      this.prisma.channelIdentifier.updateMany({
        where: { workspaceId, contactId: identifier.contactId },
        data: { isPrimary: false },
      }),
      this.prisma.channelIdentifier.updateMany({
        where: { id: identifierId, workspaceId },
        data: { isPrimary: true },
      }),
    ]);
  }
}
