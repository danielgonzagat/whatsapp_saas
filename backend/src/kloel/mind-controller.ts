import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import {
  AggressivenessDto,
  AudioVsTextDto,
  CouponDto,
  DecideDto,
  ResolveDto,
  ToneDto,
} from './mind-controller.dto';
import { MindBeliefService } from './mind-belief.service';
import { MindPolicyService } from './mind-policy.service';
import { MindService } from './mind.service';
import { MindObservabilityService } from './mind-observability.service';
import { MindVerbalizerService } from './mind-verbalizer.service';

@Controller('mind')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MindController {
  constructor(
    private readonly beliefs: MindBeliefService,
    private readonly policy: MindPolicyService,
    private readonly mind: MindService,
    private readonly verbalizer: MindVerbalizerService,
    private readonly observability: MindObservabilityService,
  ) {}

  @Post(':workspaceId/tick')
  tick(@Param('workspaceId') workspaceId: string) {
    return this.mind.tick(workspaceId);
  }

  @Get(':workspaceId/narrate')
  narrate(@Param('workspaceId') workspaceId: string) {
    return this.verbalizer.narrate(workspaceId).then((briefing) => ({ briefing }));
  }

  @Get(':workspaceId/state')
  state(@Param('workspaceId') workspaceId: string) {
    return this.observability.state(workspaceId);
  }

  @Get(':workspaceId/surprise')
  surprise(@Param('workspaceId') workspaceId: string, @Query('take') take?: string) {
    return this.observability.surprise(workspaceId, take ? Number(take) : 50);
  }

  @Get(':workspaceId/lift')
  liftAll(@Param('workspaceId') workspaceId: string, @Query('sinceDays') sinceDays?: string) {
    return this.observability.lift(workspaceId, sinceDays ? Number(sinceDays) : 14);
  }

  @Get(':workspaceId/concepts')
  concepts(@Param('workspaceId') workspaceId: string, @Query('hours') hours?: string) {
    return this.observability.concepts(workspaceId, hours ? Number(hours) : 24);
  }

  @Get(':workspaceId/health')
  health(@Param('workspaceId') workspaceId: string) {
    return this.observability.health(workspaceId);
  }

  @Get(':workspaceId/trace/:policyId')
  trace(@Param('workspaceId') workspaceId: string, @Param('policyId') policyId: string) {
    return this.observability.trace(workspaceId, policyId);
  }

  @Post(':workspaceId/ask')
  ask(@Param('workspaceId') workspaceId: string, @Body() body: { question?: string }) {
    return this.observability.ask(workspaceId, body.question ?? '');
  }

  @Post(':workspaceId/report')
  report(@Param('workspaceId') workspaceId: string) {
    return this.observability.report(workspaceId);
  }

  @Get(':workspaceId/beliefs')
  listBeliefs(
    @Param('workspaceId') workspaceId: string,
    @Query('predicate') predicate: string,
    @Query('subject') subject?: string,
  ) {
    if (!predicate?.trim()) {
      throw new BadRequestException('predicate_required');
    }
    return this.beliefs.list(workspaceId, predicate, subject);
  }

  @Get(':workspaceId/lift/:decisionType')
  lift(
    @Param('workspaceId') workspaceId: string,
    @Param('decisionType') decisionType: string,
    @Query('sinceDays') sinceDays?: string,
  ) {
    return this.mind.lift(workspaceId, decisionType, sinceDays ? Number(sinceDays) : 14);
  }

  @Post(':workspaceId/decide')
  decide(@Param('workspaceId') workspaceId: string, @Body() body: DecideDto) {
    return this.policy.choose({ workspaceId, ...body });
  }

  @Post(':workspaceId/resolve')
  async resolve(@Param('workspaceId') workspaceId: string, @Body() body: ResolveDto) {
    await this.policy.resolveOutcome(
      workspaceId,
      body.outcomeKey,
      body.outcome,
      body.baselineOutcome,
    );
    return { ok: true };
  }

  @Post(':workspaceId/aggressiveness')
  aggressiveness(@Param('workspaceId') workspaceId: string, @Body() body: AggressivenessDto) {
    return this.mind.resolveAggressiveness(
      workspaceId,
      body.domain,
      body.soldRate,
      body.repliedRate,
      body.revenuePerSignal,
    );
  }

  @Post(':workspaceId/audio-vs-text')
  audioVsText(@Param('workspaceId') workspaceId: string, @Body() body: AudioVsTextDto) {
    return this.mind.resolveAudioVsText(workspaceId, body.channel, body.audioRatio);
  }

  @Post(':workspaceId/tone')
  tone(@Param('workspaceId') workspaceId: string, @Body() body: ToneDto) {
    return this.mind.resolveTone(
      workspaceId,
      body.channel,
      body.repliedRate,
      body.soldRate,
      body.segment,
    );
  }

  @Post(':workspaceId/coupon')
  coupon(@Param('workspaceId') workspaceId: string, @Body() body: CouponDto) {
    return this.mind.resolveCoupon(workspaceId, body.priceBand, body.soldRate, body.segment);
  }
}
