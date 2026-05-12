import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import {
  AggressivenessDto,
  AudioVsTextDto,
  BestVariantDto,
  CouponDto,
  DecideDto,
  GuardEvaluateDto,
  ResolveDto,
  SimilarCasesDto,
  SimulateDto,
  ToneDto,
} from './mind-controller.dto';
import { MindBeliefService } from './mind-belief.service';
import { MindPolicyService } from './mind-policy.service';
import { MindService } from './mind.service';
import { MindObservabilityService } from './mind-observability.service';
import { MindVerbalizerService } from './mind-verbalizer.service';
import { MindGuardsService } from './mind-guards.service';
import { MindSimulatorService } from './mind-simulator.service';
import { MindSyntheticGeneratorService } from './mind-synthetic-generator.service';
import { MindGlobalPriorService } from './mind-global-prior.service';
import type { SimulateActionEntry } from './mind-simulator.service';
import type { ReplayInput } from './mind-replay.service';

@Controller('mind')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MindController {
  constructor(
    private readonly beliefs: MindBeliefService,
    private readonly policy: MindPolicyService,
    private readonly mind: MindService,
    private readonly verbalizer: MindVerbalizerService,
    private readonly observability: MindObservabilityService,
    private readonly guards: MindGuardsService,
    private readonly simulator: MindSimulatorService,
    private readonly synthetic: MindSyntheticGeneratorService,
    private readonly globalPrior: MindGlobalPriorService,
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

  @Get('runtime-evidence')
  runtimeEvidenceByQuery(@Query('workspaceId') workspaceId?: string) {
    if (!workspaceId?.trim()) {
      throw new BadRequestException('workspaceId_required');
    }
    return this.observability.runtimeEvidence(workspaceId);
  }

  @Get(':workspaceId/runtime-evidence')
  runtimeEvidence(@Param('workspaceId') workspaceId: string) {
    return this.observability.runtimeEvidence(workspaceId);
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

  @Get(':workspaceId/bandit/:decisionType')
  bandit(@Param('workspaceId') workspaceId: string, @Param('decisionType') decisionType: string) {
    return this.observability.bandit(workspaceId, decisionType);
  }

  @Get(':workspaceId/global-prior/:decisionType')
  globalPriorForDecision(@Param('decisionType') decisionType: string) {
    return this.globalPrior.getPrior(decisionType);
  }

  @Post(':workspaceId/cases/similar')
  similarCases(@Param('workspaceId') workspaceId: string, @Body() body: SimilarCasesDto) {
    return this.mind.retrieveSimilar({
      ...(body.caseType !== undefined ? { caseType: body.caseType } : {}),
      ...(body.features !== undefined ? { features: body.features } : {}),
      ...(body.limit !== undefined ? { limit: body.limit } : {}),
      text: body.text,
      workspaceId,
    });
  }

  @Post(':workspaceId/ask')
  ask(@Param('workspaceId') workspaceId: string, @Body() body: { question?: string }) {
    return this.observability.ask(workspaceId, body.question ?? '');
  }

  @Post(':workspaceId/guards/evaluate')
  evaluateGuard(@Param('workspaceId') workspaceId: string, @Body() body: GuardEvaluateDto) {
    return this.guards.evaluate({ workspaceId, ...body });
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

  @Post(':workspaceId/variant-decision')
  @Public()
  async variantDecision(
    @Param('workspaceId') workspaceId: string,
    @Body() body: BestVariantDto,
    @Headers('x-internal-key') internalKey?: string,
  ) {
    const expectedInternalKey = String(process.env.INTERNAL_API_KEY || '').trim();
    if (expectedInternalKey && internalKey !== expectedInternalKey) {
      throw new ForbiddenException('Invalid internal key');
    }
    return this.mind.resolveBestVariant(
      workspaceId,
      body.flow,
      body.variantIds,
      body.context,
    );
  }

  @Post(':workspaceId/simulate')
  simulate(@Param('workspaceId') workspaceId: string, @Body() body: SimulateDto) {
    const seed = body.seed ?? 42;
    this.synthetic.setSeed(seed);

    let decisions: ReplayInput[];
    if (body.decisions && body.decisions.length > 0) {
      decisions = body.decisions.map((d) => ({
        workspaceId,
        decisionType: d.decisionType,
        candidates: d.candidates.map((c) => ({
          action: c.action,
          beliefMean: c.beliefMean,
          beliefVariance: c.beliefVariance,
        })),
        ...(d.baseline !== undefined ? { baseline: d.baseline } : {}),
        ...(d.epsilon !== undefined ? { epsilon: d.epsilon } : {}),
        ...(d.utilitySuccess !== undefined ? { utilitySuccess: d.utilitySuccess } : {}),
        ...(d.utilityFail !== undefined ? { utilityFail: d.utilityFail } : {}),
      }));
    } else if (body.actions && body.actions.length > 0) {
      const recipeKeys = body.recipeKeys ?? ['followup_timing', 'cart_recovery', 'coupon_offer'];
      const recipes = MindSyntheticGeneratorService.builtinRecipes();
      decisions = recipeKeys
        .map((key, index) => {
          const recipe = recipes[key];
          return recipe ? this.synthetic.generateDecision(recipe, seed + index * 100) : null;
        })
        .filter((decision): decision is ReplayInput => decision !== null);
    } else {
      const report = this.simulator.simulateSyntheticWorkspace(workspaceId, seed);
      return {
        report,
        markdown: this.simulator.reportToMarkdown(report),
      };
    }

    let actions: SimulateActionEntry[];
    if (body.actions && body.actions.length > 0) {
      actions = body.actions.map((a) => ({
        action: a.action,
        decisionType: a.decisionType,
        context: a.context,
      }));
    } else {
      const allActions = decisions.flatMap((d) => d.candidates.map((c) => c.action));
      const uniqueActions = [...new Set(allActions)];
      const syntheticActions = this.synthetic.generateActionContexts(uniqueActions, seed + 500, {
        injectViolations: false,
      });
      actions = syntheticActions.map((sa) => ({
        action: sa.action,
        decisionType: decisions[0]?.decisionType ?? 'followup_timing',
        context: sa.context,
      }));
    }

    const liftData = {
      lift: body.lift ?? 0.05,
      pZScore: body.pZScore ?? 0.8,
      samples: body.samples ?? 100,
      fallbackActive: body.fallbackActive ?? false,
    };

    const report = this.simulator.simulateFromDecisions(workspaceId, decisions, actions, liftData);

    return {
      report,
      markdown: this.simulator.reportToMarkdown(report),
    };
  }
}
