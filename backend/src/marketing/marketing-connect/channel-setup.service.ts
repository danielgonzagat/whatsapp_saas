import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { toPrismaJsonValue } from '../../common/prisma/prisma-json.util';
import { PrismaService } from '../../prisma/prisma.service';
import { asProviderSettings } from '../../whatsapp/provider-settings.types';
import {
  assertMarketingChannel,
  readMarketingChannelSetup,
  normalizeStep,
  normalizeStringArray,
  normalizeRecord,
  normalizeArsenal,
  type MarketingChannelSetupPayload,
} from './shared/channel-helpers';

function toInputJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => typeof entry !== 'undefined')
      .map(([key, entry]) => [key, toPrismaJsonValue(entry)]),
  );
}

@Injectable()
export class ChannelSetupService {
  private readonly logger = new Logger(ChannelSetupService.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.debug?.(`ChannelSetupService initialized`);
  }

  async getSetup(workspaceId: string, rawChannel?: string) {
    const channel = assertMarketingChannel(rawChannel);
    const [workspace, setupRecord] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      }),
      this.prisma.channelSetup.findUnique({
        where: { workspaceId_channel: { workspaceId, channel } },
        select: { completedAt: true, currentStep: true },
      }),
    ]);
    const providerSettings = asProviderSettings(workspace?.providerSettings);
    return {
      channel,
      setup: {
        currentStep: setupRecord?.currentStep ?? 0,
        selectedProductIds: [],
        arsenal: [],
        config: {},
        ...readMarketingChannelSetup(providerSettings, channel),
      },
      completedAt: setupRecord?.completedAt?.toISOString() ?? null,
    };
  }

  async saveSetup(workspaceId: string, body: MarketingChannelSetupPayload = {}) {
    const channel = assertMarketingChannel(body.channel);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const currentSettings = asProviderSettings(workspace?.providerSettings);
    const existingSetup = readMarketingChannelSetup(currentSettings, channel);
    const allSetups =
      currentSettings.marketingChannelSetup &&
      typeof currentSettings.marketingChannelSetup === 'object' &&
      !Array.isArray(currentSettings.marketingChannelSetup)
        ? (currentSettings.marketingChannelSetup as Record<string, unknown>)
        : {};
    const nextSetup = {
      ...existingSetup,
      currentStep: normalizeStep(body.currentStep, normalizeStep(existingSetup.currentStep)),
      selectedProductIds: normalizeStringArray(body.selectedProductIds),
      arsenal: normalizeArsenal(body.arsenal),
      config: {
        ...normalizeRecord(existingSetup.config),
        ...normalizeRecord(body.config),
      },
      updatedAt: new Date().toISOString(),
    };

    await Promise.all([
      this.prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          providerSettings: toInputJsonObject({
            ...currentSettings,
            marketingChannelSetup: {
              ...allSetups,
              [channel]: nextSetup,
            },
          }),
        },
      }),
      this.prisma.channelSetup.upsert({
        where: { workspaceId_channel: { workspaceId, channel } },
        create: { workspaceId, channel, currentStep: nextSetup.currentStep },
        update: { currentStep: nextSetup.currentStep },
      }),
    ]);

    return { channel, setup: nextSetup };
  }

  async completeSetup(workspaceId: string, body: MarketingChannelSetupPayload = {}) {
    const channel = assertMarketingChannel(body.channel);
    const [workspace, existingSetup] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      }),
      this.prisma.channelSetup.findUnique({
        where: { workspaceId_channel: { workspaceId, channel } },
        select: { currentStep: true },
      }),
    ]);
    const providerSettings = asProviderSettings(workspace?.providerSettings);
    const jsonSetup = readMarketingChannelSetup(providerSettings, channel);
    const step = existingSetup?.currentStep ?? normalizeStep(jsonSetup.currentStep);
    if (step < 3) {
      throw new BadRequestException(
        `setup_not_complete: step ${step} of 3, complete all four steps before concluding`,
      );
    }
    if (!Array.isArray(jsonSetup.selectedProductIds) || jsonSetup.selectedProductIds.length === 0) {
      throw new BadRequestException('setup_not_complete: no products selected');
    }
    const hasConfig =
      jsonSetup.config &&
      typeof jsonSetup.config === 'object' &&
      !Array.isArray(jsonSetup.config) &&
      typeof (jsonSetup.config as Record<string, unknown>).tone === 'string';
    if (!hasConfig) {
      throw new BadRequestException('setup_not_complete: missing channel configuration');
    }

    const nextSetup = await this.prisma.channelSetup.upsert({
      where: { workspaceId_channel: { workspaceId, channel } },
      create: {
        workspaceId,
        channel,
        currentStep: 3,
        completedAt: new Date(),
      },
      update: { currentStep: 3, completedAt: new Date() },
    });

    return {
      channel,
      currentStep: nextSetup.currentStep,
      completedAt: nextSetup.completedAt?.toISOString() ?? null,
    };
  }
}
