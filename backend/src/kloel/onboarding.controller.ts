import { Controller, Post, Get, Body, Param, Delete, Logger } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';

@Controller('kloel/onboarding')
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('start/:workspaceId')
  async start(@Param('workspaceId') workspaceId: string) {
    return this.onboardingService.startOnboarding(workspaceId);
  }

  @Post('respond/:workspaceId')
  async respond(@Param('workspaceId') workspaceId: string, @Body() body: { response: string }) {
    return this.onboardingService.processResponse(workspaceId, body.response);
  }

  @Get('status/:workspaceId')
  async status(@Param('workspaceId') workspaceId: string) {
    return this.onboardingService.getStatus(workspaceId);
  }
}
