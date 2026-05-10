import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CHANNELS = new Set(['whatsapp', 'instagram', 'facebook', 'messenger', 'tiktok', 'email']);
const ARSENAL_TYPES = new Set(['text', 'audio', 'image', 'video', 'document', 'template']);
const CHANNEL_ALIAS: Record<string, string> = { messenger: 'facebook' };

export interface SaveProductsInput {
  productIds?: string[];
}

export interface SaveArsenalInput {
  assetId?: string;
  type?: string;
  label?: string;
  storageRef?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface SaveConfigInput {
  tone?: string;
  aggressiveness?: string;
  businessHours?: Prisma.InputJsonValue;
  followupEnabled?: boolean;
  dailyMessageLimit?: number;
  transferCriteria?: Prisma.InputJsonValue;
  language?: string;
}

@Injectable()
export class ChannelSetupService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(workspaceId: string, channel: string) {
    const normalizedChannel = normalizeSetupChannel(channel);
    const [setup, config, products, selected, arsenal] = await Promise.all([
      this.prisma.channelSetup.findUnique({
        where: { workspaceId_channel: { workspaceId, channel: normalizedChannel } },
      }),
      this.prisma.channelConfig.findUnique({
        where: { workspaceId_channel: { workspaceId, channel: normalizedChannel } },
      }),
      this.prisma.product.findMany({
        where: { workspaceId },
        select: { id: true, name: true, price: true, active: true, status: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.channelProduct.findMany({
        where: { workspaceId, channel: normalizedChannel },
        select: { productId: true, includedAt: true },
      }),
      this.prisma.channelArsenal.findMany({
        where: { workspaceId, channel: normalizedChannel },
        orderBy: { uploadedAt: 'desc' },
      }),
    ]);
    const selectedProductIds = selected.map((item) => item.productId);
    return {
      channel: normalizedChannel,
      setup: setup ?? null,
      config: config ?? null,
      products,
      selectedProductIds,
      arsenal,
      completed: Boolean(setup?.completedAt),
    };
  }

  async saveProducts(workspaceId: string, channel: string, input: SaveProductsInput) {
    const normalizedChannel = normalizeSetupChannel(channel);
    const productIds = uniqueStrings(input.productIds ?? []);
    await this.assertProductsBelongToWorkspace(workspaceId, productIds);
    await this.prisma.$transaction([
      this.prisma.channelProduct.deleteMany({ where: { workspaceId, channel: normalizedChannel } }),
      ...productIds.map((productId) =>
        this.prisma.channelProduct.create({
          data: { workspaceId, channel: normalizedChannel, productId },
        }),
      ),
      this.upsertSetupQuery(workspaceId, normalizedChannel, 1),
    ]);
    return this.getState(workspaceId, normalizedChannel);
  }

  async addArsenal(workspaceId: string, channel: string, input: SaveArsenalInput) {
    const normalizedChannel = normalizeSetupChannel(channel);
    const type = normalizeArsenalType(input.type);
    const storageRef = input.storageRef?.trim();
    if (!storageRef) {
      throw new BadRequestException('storageRef obrigatorio');
    }
    await this.prisma.$transaction([
      this.prisma.channelArsenal.upsert({
        where: {
          workspaceId_channel_assetId: {
            workspaceId,
            channel: normalizedChannel,
            assetId: input.assetId?.trim() || randomUUID(),
          },
        },
        create: {
          workspaceId,
          channel: normalizedChannel,
          assetId: input.assetId?.trim() || randomUUID(),
          type,
          label: input.label?.trim() || null,
          storageRef,
          metadata: input.metadata ?? Prisma.JsonNull,
        },
        update: {
          type,
          label: input.label?.trim() || null,
          storageRef,
          metadata: input.metadata ?? Prisma.JsonNull,
        },
      }),
      this.upsertSetupQuery(workspaceId, normalizedChannel, 2),
    ]);
    return this.getState(workspaceId, normalizedChannel);
  }

  async removeArsenal(workspaceId: string, channel: string, assetId: string) {
    const normalizedChannel = normalizeSetupChannel(channel);
    await this.prisma.channelArsenal.deleteMany({
      where: { workspaceId, channel: normalizedChannel, assetId },
    });
    return this.getState(workspaceId, normalizedChannel);
  }

  async saveConfig(workspaceId: string, channel: string, input: SaveConfigInput) {
    const normalizedChannel = normalizeSetupChannel(channel);
    const data = buildConfigData(input);
    await this.prisma.$transaction([
      this.prisma.channelConfig.upsert({
        where: { workspaceId_channel: { workspaceId, channel: normalizedChannel } },
        create: { workspaceId, channel: normalizedChannel, ...data },
        update: data,
      }),
      this.upsertSetupQuery(workspaceId, normalizedChannel, 3),
    ]);
    return this.getState(workspaceId, normalizedChannel);
  }

  async complete(workspaceId: string, channel: string) {
    const normalizedChannel = normalizeSetupChannel(channel);
    await this.requireConfig(workspaceId, normalizedChannel);
    await this.prisma.channelSetup.upsert({
      where: { workspaceId_channel: { workspaceId, channel: normalizedChannel } },
      create: { workspaceId, channel: normalizedChannel, currentStep: 3, completedAt: new Date() },
      update: { currentStep: 3, completedAt: new Date() },
    });
    return this.getState(workspaceId, normalizedChannel);
  }

  async reconfigure(workspaceId: string, channel: string) {
    const normalizedChannel = normalizeSetupChannel(channel);
    await this.prisma.channelSetup.upsert({
      where: { workspaceId_channel: { workspaceId, channel: normalizedChannel } },
      create: { workspaceId, channel: normalizedChannel, currentStep: 0 },
      update: { completedAt: null, lastReconfiguredAt: new Date(), currentStep: 0 },
    });
    return this.getState(workspaceId, normalizedChannel);
  }

  private upsertSetupQuery(workspaceId: string, channel: string, currentStep: number) {
    return this.prisma.channelSetup.upsert({
      where: { workspaceId_channel: { workspaceId, channel } },
      create: { workspaceId, channel, currentStep },
      update: { currentStep },
    });
  }

  private async assertProductsBelongToWorkspace(workspaceId: string, productIds: string[]) {
    if (productIds.length === 0) return;
    const found = await this.prisma.product.count({
      where: { workspaceId, id: { in: productIds } },
    });
    if (found !== productIds.length) {
      throw new NotFoundException('produto_do_canal_nao_encontrado');
    }
  }

  private async requireConfig(workspaceId: string, channel: string) {
    const config = await this.prisma.channelConfig.findUnique({
      where: { workspaceId_channel: { workspaceId, channel } },
      select: { id: true },
    });
    if (!config) {
      throw new BadRequestException('configuracao_do_canal_obrigatoria');
    }
  }
}

export function normalizeSetupChannel(channel: string): string {
  const normalized = CHANNEL_ALIAS[channel.toLowerCase()] ?? channel.toLowerCase();
  if (!CHANNELS.has(normalized)) {
    throw new BadRequestException('canal_invalido');
  }
  return normalized;
}

function normalizeArsenalType(type?: string): string {
  const normalized = type?.toLowerCase().trim() || 'text';
  if (!ARSENAL_TYPES.has(normalized)) {
    throw new BadRequestException('tipo_de_arsenal_invalido');
  }
  return normalized;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function buildConfigData(input: SaveConfigInput) {
  const dailyMessageLimit = Number(input.dailyMessageLimit ?? 20);
  if (!Number.isFinite(dailyMessageLimit) || dailyMessageLimit < 1 || dailyMessageLimit > 500) {
    throw new BadRequestException('limite_diario_invalido');
  }
  return {
    tone: input.tone?.trim() || 'consultivo',
    aggressiveness: input.aggressiveness?.trim() || 'normal',
    businessHours: input.businessHours ?? {},
    followupEnabled: input.followupEnabled ?? true,
    dailyMessageLimit,
    transferCriteria: input.transferCriteria ?? {},
    language: input.language?.trim() || 'pt-BR',
  };
}
