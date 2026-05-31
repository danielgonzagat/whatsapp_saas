/**
 * LIVENESS PROOF (part 2) — the FAILURE path of the cognitive loop.
 *
 * Companion to `./cognitive-loop-liveness.proof.spec`. Where part 1 proves the
 * success path moves the belief alpha and records a won-vs-baseline reward,
 * this spec drives a DEGRADED reply (no assistant text produced → observed 0)
 * end-to-end through the same REAL cognitive services and asserts the belief's
 * beta increments off the Beta(1,1) prior AND the bandit arm records a
 * loss-vs-baseline reward. Same faithful in-memory Prisma double from
 * `./cognitive-loop-liveness.proof.helpers`. If the wiring regresses, this
 * proof goes red — never weaken an assertion to force green.
 */
import { DecisionOutcomeService } from './decision-outcome.service';
import { MindBeliefService } from './mind/inference/mind-belief.service';
import { MindPredictorService } from './mind/inference/mind-predictor.service';
import { MindSurpriseService } from './mind/inference/mind-surprise.service';
import { MindBanditService } from './mind/policy/mind-bandit.service';
import { MindGlobalPriorService } from './mind/memory/mind-global-prior.service';
import { RecordingPrisma, WS } from './cognitive-loop-liveness.proof.helpers';

describe('Cognitive loop LIVENESS PROOF — a failed reply moves beta and records a loss', () => {
  let prisma: RecordingPrisma;
  let bandit: MindBanditService;
  let belief: MindBeliefService;
  let predictor: MindPredictorService;
  let surprise: MindSurpriseService;
  let globalPrior: MindGlobalPriorService;
  let decisionOutcome: DecisionOutcomeService;

  beforeEach(() => {
    prisma = new RecordingPrisma();
    bandit = new MindBanditService(prisma);
    // globalPrior wired into belief so getOrInit seeds Beta(1,1) when no prior.
    globalPrior = new MindGlobalPriorService(prisma);
    belief = new MindBeliefService(prisma, globalPrior);
    predictor = new MindPredictorService(prisma, belief);
    surprise = new MindSurpriseService(prisma, belief, predictor);
    decisionOutcome = new DecisionOutcomeService(prisma, bandit);
  });

  it('a FAILED reply moves the belief beta and records a loss-vs-baseline reward', async () => {
    const subject = WS;
    const outcomeKey = `chat:${WS}:${Date.now()}:proof02`;

    await decisionOutcome.recordDecision({
      workspaceId: WS,
      decisionType: 'chat_reply',
      chosenAction: 'engage',
      baselineAction: 'silence',
      outcomeKey,
      expectedWindow: 1,
      contextSnapshot: { surface: 'guest', messageLength: 0 },
    });
    await new Promise((r) => setImmediate(r));

    await predictor.predictReply(
      { workspaceId: WS, subject, features: { template: 'guest', channel: 'guest', hour: 9 } },
      60,
    );

    // observed = 0 → degraded reply (no assistant text produced).
    await surprise.resolveReply(WS, subject, 0);
    const movedBelief = prisma.beliefs.find(
      (b) => b.predicate === 'P(reply|template,hour,channel)',
    );
    expect(movedBelief?.alpha).toBe(1); // unchanged on a failure
    expect(movedBelief?.beta).toBe(2); // 1 (prior) + 1 (failure)
    expect(movedBelief?.samples).toBe(1);

    await decisionOutcome.closeOutcome({
      outcomeKey,
      outcomeName: 'chat.error',
      wonVsBaseline: false,
    });
    const learnedArm = prisma.arms.find((a) => a.arm === 'engage');
    expect(learnedArm?.beta).toBe(2); // 1 (prior) + 1 (loss)
    expect(learnedArm?.wins).toBe(0);
    expect(prisma.outcomes[0].wonVsBaseline).toBe(false);
  });
});
