import { Controller, Post, Get, Body, Param, Logger } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';

/**
 * @deprecated Use the conversational onboarding via KloelController instead.
 * Endpoints:
 *   POST /kloel/onboarding/:workspaceId/start
 *   POST /kloel/onboarding/:workspaceId/chat
 *   GET  /kloel/onboarding/:workspaceId/status
 * 
 * This static onboarding is kept for backwards compatibility only.
 * It will be removed in a future version.
 */
@Controller('kloel/onboarding-legacy')
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(private readonly onboardingService: OnboardingService) {
    this.logger.warn('⚠️ DEPRECATED: OnboardingController is deprecated. Use conversational onboarding instead.');
  }

  @Post('start/:workspaceId')
  async start(@Param('workspaceId') workspaceId: string) {
    this.logger.warn(`⚠️ DEPRECATED: Use POST /kloel/onboarding/${workspaceId}/start instead`);
    return this.onboardingService.startOnboarding(workspaceId);
  }

  @Post('respond/:workspaceId')
  async respond(@Param('workspaceId') workspaceId: string, @Body() body: { response: string }) {
    this.logger.warn(`⚠️ DEPRECATED: Use POST /kloel/onboarding/${workspaceId}/chat instead`);
    return this.onboardingService.processResponse(workspaceId, body.response);
  }

  @Get('status/:workspaceId')
  async status(@Param('workspaceId') workspaceId: string) {
    return this.onboardingService.getStatus(workspaceId);
  }
}
