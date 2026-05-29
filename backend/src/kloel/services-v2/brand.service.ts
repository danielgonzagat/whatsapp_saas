import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../../logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';

export interface BrandSetVoiceArgs {
  voiceId?: string;
  voiceName?: string;
  provider?: string;
  tone?: string;
  [key: string]: unknown;
}

/**
 * BrandService — manages workspace brand voice settings.
 *
 * domainService alias: BrandService.setVoice
 * Workspace isolation: all mutations scoped to workspaceId.
 *
 * Voice config is stored in workspace.providerSettings JSON under the
 * "brandVoice" key. If a VoiceProfile is specified by name/id, it is
 * resolved and linked.
 */
@Injectable()
export class BrandService {
  private readonly logger = StructuredLogger.from(BrandService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Set the brand voice for the workspace. */
  async setVoice(
    workspaceId: string,
    args: BrandSetVoiceArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const current =
      ws?.providerSettings && typeof ws.providerSettings === 'object'
        ? (ws.providerSettings as Record<string, unknown>)
        : {};

    const currentVoice =
      current.brandVoice && typeof current.brandVoice === 'object'
        ? (current.brandVoice as Record<string, unknown>)
        : {};

    const patch: Record<string, unknown> = { ...currentVoice };
    if (args.voiceId !== undefined) patch.voiceId = String(args.voiceId);
    if (args.voiceName !== undefined) patch.voiceName = String(args.voiceName);
    if (args.provider !== undefined) patch.provider = String(args.provider);
    if (args.tone !== undefined) patch.tone = String(args.tone);

    const updatedSettings = { ...current, brandVoice: patch };

    // If a VoiceProfile record exists with the given voiceId, verify it belongs to workspace
    if (args.voiceId) {
      const voiceProfile = await this.prisma.voiceProfile.findFirst({
        where: { id: String(args.voiceId), workspaceId },
        select: { id: true, name: true, provider: true, voiceId: true },
      });
      if (voiceProfile) {
        patch.voiceId = voiceProfile.voiceId;
        patch.voiceName = patch.voiceName ?? voiceProfile.name;
        patch.provider = patch.provider ?? voiceProfile.provider;
      }
    }

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { providerSettings: updatedSettings as Prisma.InputJsonValue },
    });

    this.logger.log(`BrandService.setVoice ws=${workspaceId}`, patch);
    return { success: true, data: patch };
  }
}
