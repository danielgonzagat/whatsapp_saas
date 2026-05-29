import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../../logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';

export interface ThemeSetArgs {
  primaryColor?: string;
  logoUrl?: string;
  coverUrl?: string;
  theme?: string;
  [key: string]: unknown;
}

/**
 * ThemeService — sets workspace visual theme (branding JSON on Workspace).
 *
 * domainService alias: ThemeService.set
 * Workspace isolation: every mutation scoped to workspaceId.
 */
@Injectable()
export class ThemeService {
  private readonly logger = StructuredLogger.from(ThemeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Set workspace branding theme fields. */
  async set(workspaceId: string, args: ThemeSetArgs): Promise<{ success: boolean; data: unknown }> {
    const patch: Record<string, unknown> = {};

    if (args.primaryColor !== undefined) patch.primaryColor = String(args.primaryColor);
    if (args.logoUrl !== undefined) patch.logoUrl = String(args.logoUrl);
    if (args.coverUrl !== undefined) patch.coverUrl = String(args.coverUrl);
    if (args.theme !== undefined) patch.theme = String(args.theme);

    // Merge into branding JSON stored on workspace
    const existing = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { branding: true },
    });

    const currentBranding =
      existing?.branding && typeof existing.branding === 'object' ? existing.branding : {};

    const merged = { ...(currentBranding as Record<string, unknown>), ...patch };

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { branding: merged as Prisma.InputJsonValue },
    });

    this.logger.log(`ThemeService.set workspace=${workspaceId}`, patch);
    return { success: true, data: merged };
  }
}
