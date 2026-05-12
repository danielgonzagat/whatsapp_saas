import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { StorageService } from '../common/storage/storage.service';
import { detectUploadedMime } from '../common/file-signature.util';
import { PrismaService } from '../prisma/prisma.service';

const CHANNELS = new Set(['whatsapp', 'instagram', 'facebook', 'messenger', 'tiktok', 'email']);
const ARSENAL_TYPES = new Set(['text', 'audio', 'image', 'video', 'document', 'template']);
const CHANNEL_ALIAS: Record<string, string> = { messenger: 'facebook' };
const MIME_BY_ARSENAL_TYPE: Record<string, ReadonlySet<string>> = {
  audio: new Set([
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'audio/mp4',
    'audio/x-m4a',
  ]),
  document: new Set([
    'application/msword',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/csv',
    'text/plain',
  ]),
  image: new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']),
  template: new Set(['text/csv', 'text/plain']),
  text: new Set(['text/csv', 'text/plain']),
  video: new Set(['video/webm', 'audio/mp4']),
};

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'application/msword': '.doc',
  'application/pdf': '.pdf',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.mp4',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/webm': '.webm',
  'audio/x-m4a': '.m4a',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'text/csv': '.csv',
  'text/plain': '.txt',
  'video/webm': '.webm',
};

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

export interface ChannelArsenalUploadFile {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
  size?: number;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

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
    const assetId = input.assetId?.trim() || randomUUID();
    if (!storageRef) {
      throw new BadRequestException('storageRef obrigatorio');
    }
    await this.prisma.$transaction([
      this.prisma.channelArsenal.upsert({
        where: {
          workspaceId_channel_assetId: {
            workspaceId,
            channel: normalizedChannel,
            assetId,
          },
        },
        create: {
          workspaceId,
          channel: normalizedChannel,
          assetId,
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

  async addArsenalUpload(
    workspaceId: string,
    channel: string,
    input: SaveArsenalInput,
    file: ChannelArsenalUploadFile,
  ) {
    const normalizedChannel = normalizeSetupChannel(channel);
    const type = normalizeArsenalType(input.type);
    const assetId = input.assetId?.trim() || randomUUID();
    if (!file?.buffer?.length) {
      throw new BadRequestException('arquivo_do_arsenal_obrigatorio');
    }
    const mimeType = validateArsenalUploadMime(type, file);
    const stored = await this.storage.upload(file.buffer, {
      filename: `${assetId}${EXTENSION_BY_MIME_TYPE[mimeType] ?? ''}`,
      folder: `channel-arsenal/${workspaceId}/${normalizedChannel}`,
      mimeType,
      workspaceId,
    });
    return this.addArsenal(workspaceId, normalizedChannel, {
      ...input,
      assetId,
      storageRef: stored.path,
      metadata: {
        originalName: file.originalname || null,
        publicUrl: stored.url,
        size: file.size ?? stored.size,
      },
      type,
    });
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

function validateArsenalUploadMime(type: string, file: ChannelArsenalUploadFile): string {
  const detectedMime = detectUploadedMime({
    buffer: file.buffer,
    ...(file.mimetype !== undefined ? { mimetype: file.mimetype } : {}),
    ...(file.originalname !== undefined ? { originalname: file.originalname } : {}),
  });
  if (!detectedMime) {
    throw new BadRequestException('assinatura_do_arquivo_invalida');
  }
  const allowed = MIME_BY_ARSENAL_TYPE[type];
  if (!allowed?.has(detectedMime)) {
    throw new BadRequestException('tipo_de_arquivo_incompativel_com_arsenal');
  }
  return detectedMime;
}

export function isAllowedDeclaredArsenalMime(mimetype?: string): boolean {
  const normalized = mimetype?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return Object.values(MIME_BY_ARSENAL_TYPE).some((allowed) => allowed.has(normalized));
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
