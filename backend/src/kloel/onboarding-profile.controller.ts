import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { OnboardingService } from './onboarding.service';

type OnboardingProfileDto = {
  userType?: string;
  productType?: string;
  primaryChannel?: string;
  hasProduct?: boolean;
  hasCheckout?: boolean;
  aiUseCase?: string;
};

function readRequiredString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/** Persists structured setup choices from first-login onboarding. */
@Controller('kloel/onboarding')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class OnboardingProfileController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post(':workspaceId/profile')
  async saveProfile(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: OnboardingProfileDto,
  ) {
    const validatedWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.onboardingService.saveProfile(validatedWorkspaceId, {
      userType: readRequiredString(dto.userType, 'producer'),
      productType: readRequiredString(dto.productType, 'digital'),
      primaryChannel: readRequiredString(dto.primaryChannel, 'whatsapp'),
      hasProduct: dto.hasProduct === true,
      hasCheckout: dto.hasCheckout === true,
      aiUseCase: readRequiredString(dto.aiUseCase, 'sales'),
    });
  }

  @Post(':workspaceId/complete')
  async complete(@Req() req: AuthenticatedRequest, @Param('workspaceId') workspaceId: string) {
    const validatedWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.onboardingService.complete(validatedWorkspaceId);
  }
}
