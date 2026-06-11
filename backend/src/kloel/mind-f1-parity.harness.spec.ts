/**
 * MIND_UNIFICATION_PLAN §7 F0–F1 — parity harness (flags-ON half).
 *
 * Runs the REAL `DecisionOutcomeService` + `DecisionSweepScheduler` against a
 * STATEFUL in-memory ledger (both `RAC_DecisionOutcome` and `RAC_MindPolicy`
 * tables) with the F1/F2 flags toggled via the test process env. No flag is
 * ever required in production for this suite — it exists precisely so flag-ON
 * behavior is proven BEFORE any prod flip.
 *
 * What this file adds on top of the existing specs (extends, does not duplicate):
 *   - `decision-ledger-dualwrite.spec.ts` proves the mirror CALLS fire; here we
 *     prove the resulting ROWS in the two ledgers carry EQUIVALENT payloads
 *     over the full record→close lifecycle (the F2 parity-reader contract).
 *   - `real-reward-signal.wiring.spec.ts` proves the reply engine SKIPS the
 *     immediate WIN-close when `KLOEL_REAL_REWARD_SIGNAL` is on; here we pick
 *     up from that contract and prove the LEDGER consequence lifecycle: the
 *     decision stays PENDING (open) until the sweep records the real LOSS or
 *     the continuation/commerce path records the real WIN.
 *
 * The all-flags-OFF regression half lives in
 * `mind-f1-parity.harness.part2.spec.ts`; the shared stateful harness lives in
 * `mind-f1-parity.harness.fixtures.ts` (CI max_new_file_lines split — no test
 * was changed or dropped).
 *
 * @see docs/architecture/MIND_UNIFICATION_PLAN.md (§7 F1/F2, Apêndice A)
 * @see docs/architecture/MIND_F1_FLAGON_RUNBOOK.md (prod flip runbook)
 */
import {
  closeOpenChatRepliesAsContinued,
  isRealRewardSignalEnabled,
} from './real-reward-signal.flag';
import { recordChatReplyDecision } from './kloel-reply-engine.decision-outcome.helpers';
import { DECISION_LEDGER_MIRROR_SOURCE } from './decision-ledger-dualwrite.helpers';
import {
  buildHarness,
  flush,
  HOURS,
  recordInput,
  setupParityFlagEnv,
  silentLogger,
  type Row,
} from './mind-f1-parity.harness.fixtures';

setupParityFlagEnv();

// ---------------------------------------------------------------------------

describe('MIND F0–F1 parity harness (flags ON only via test env — never flips prod)', () => {
  describe('F2-prep — decision-ledger dual-write parity (KLOEL_DECISION_LEDGER_DUALWRITE=true)', () => {
    it('recordDecision lands ONE row in EACH ledger with equivalent payloads', async () => {
      process.env.KLOEL_DECISION_LEDGER_DUALWRITE = 'true';
      const h = buildHarness();

      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:k1'));

      expect(h.decisionOutcome.rows).toHaveLength(1);
      expect(h.mindPolicy.rows).toHaveLength(1);
      const canonical = h.decisionOutcome.rows[0] as Row;
      const mirror = h.mindPolicy.rows[0] as Row;

      // Field-by-field cross-ledger equivalence (the F2 parity-reader contract:
      // join on outcomeKey, compare workspace/type/actions/context).
      expect(mirror.workspaceId).toBe(canonical.workspaceId);
      expect(mirror.decisionType).toBe(canonical.decisionType);
      expect(mirror.chosen).toBe(canonical.chosenAction);
      expect(mirror.baseline).toBe(canonical.baselineAction);
      expect(mirror.outcomeKey).toBe(canonical.outcomeKey);
      expect(mirror.subject).toBe(canonical.outcomeKey);
      expect(mirror.context).toMatchObject(canonical.contextSnapshot as Record<string, unknown>);
      expect((mirror.context as Record<string, unknown>).source).toBe(
        DECISION_LEDGER_MIRROR_SOURCE,
      );
      expect(mirror.candidates).toEqual([{ action: 'engage' }, { action: 'silence' }]);
      // Both sides open: the decision has not been consequence-closed yet.
      expect(canonical.outcomeAt).toBeNull();
      expect(mirror.resolvedAt).toBeNull();
    });

    it('closeOutcome WIN resolves BOTH ledgers equivalently (wonVsBaseline=true ↔ outcome=1)', async () => {
      process.env.KLOEL_DECISION_LEDGER_DUALWRITE = 'true';
      const h = buildHarness();
      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:k1'));

      await h.service.closeOutcome({
        outcomeKey: 'chat:ws-1:k1',
        outcomeName: 'chat.replied',
        wonVsBaseline: true,
      });

      const canonical = h.decisionOutcome.rows[0] as Row;
      const mirror = h.mindPolicy.rows[0] as Row;
      expect(canonical.outcomeAt).toBeInstanceOf(Date);
      expect(canonical.outcomeName).toBe('chat.replied');
      expect(canonical.wonVsBaseline).toBe(true);
      expect(mirror.resolvedAt).toBeInstanceOf(Date);
      expect(mirror.outcome).toBe(1);
    });

    it('closeOutcome LOSS resolves BOTH ledgers equivalently (wonVsBaseline=false ↔ outcome=0)', async () => {
      process.env.KLOEL_DECISION_LEDGER_DUALWRITE = 'true';
      const h = buildHarness();
      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:k1'));

      await h.service.closeOutcome({
        outcomeKey: 'chat:ws-1:k1',
        outcomeName: 'chat.error',
        wonVsBaseline: false,
      });

      expect((h.decisionOutcome.rows[0] as Row).wonVsBaseline).toBe(false);
      expect((h.mindPolicy.rows[0] as Row).outcome).toBe(0);
      expect((h.mindPolicy.rows[0] as Row).resolvedAt).toBeInstanceOf(Date);
    });

    it('KNOWN F2 GAP (documented, current behavior): sweepExpired and closeOpenChatReplies close ONLY the canonical ledger — the MindPolicy mirror stays open', async () => {
      // This is the divergence the F2 parity reader WILL see for sweep/continuation
      // -closed rows. It must be reconciled (mirror-resolution on both paths)
      // before KLOEL_DECISION_LEDGER_READ_CANONICAL can flip. Asserted here so
      // the gap is load-bearing documentation, not folklore.
      process.env.KLOEL_DECISION_LEDGER_DUALWRITE = 'true';
      const h = buildHarness();

      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:swept'));
      await h.service.recordDecision(recordInput('ws-2', 'chat:ws-2:continued'));
      (h.decisionOutcome.rows[0] as Row).createdAt = new Date(Date.now() - 25 * HOURS);

      await h.service.sweepExpired('ws-1', 24);
      await h.service.closeOpenChatReplies('ws-2', {
        outcomeName: 'chat.continued',
        wonVsBaseline: true,
      });

      // Canonical: both closed.
      expect((h.decisionOutcome.rows[0] as Row).outcomeName).toBe('inbound.silent_24h');
      expect((h.decisionOutcome.rows[1] as Row).outcomeName).toBe('chat.continued');
      // Mirror: both rows still UNRESOLVED (the gap).
      expect((h.mindPolicy.rows[0] as Row).resolvedAt).toBeNull();
      expect((h.mindPolicy.rows[1] as Row).resolvedAt).toBeNull();
    });
  });

  describe('F1 — real reward lifecycle (KLOEL_REAL_REWARD_SIGNAL + KLOEL_DECISION_SWEEP_ENABLED = true)', () => {
    beforeEach(() => {
      process.env.KLOEL_REAL_REWARD_SIGNAL = 'true';
      process.env.KLOEL_DECISION_SWEEP_ENABLED = 'true';
    });

    it('a chat_reply recorded WITHOUT the immediate WIN-close stays PENDING (open, no reward fed)', async () => {
      // The reply engine suppresses the immediate `chat.replied` WIN-close when
      // the flag is on (proven in real-reward-signal.wiring.spec.ts). This
      // harness picks up from that contract: record only, no close.
      expect(isRealRewardSignalEnabled()).toBe(true);
      const h = buildHarness();

      recordChatReplyDecision(h.service, silentLogger, {
        workspaceId: 'ws-1',
        outcomeKey: 'chat:ws-1:k1',
        surface: 'dashboard',
        messageLength: 3,
      });
      await flush();

      const row = h.decisionOutcome.rows[0] as Row;
      expect(row.decisionType).toBe('chat_reply');
      expect(row.outcomeAt).toBeNull(); // PENDING — não fecha como WIN imediato
      expect(h.bandit.register).toHaveBeenCalledWith(
        expect.objectContaining({ decisionType: 'chat_reply', arms: ['engage', 'silence'] }),
      );
      expect(h.bandit.recordOutcome).not.toHaveBeenCalled(); // no reward until a real consequence
    });

    it('the sweep does NOT close the pending decision before the 24h window', async () => {
      const h = buildHarness();
      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:k1'));

      const summary = await h.scheduler.sweepActiveWorkspaces();

      expect(summary.skipped).toBe(false);
      expect(summary.sweptCount).toBe(0);
      expect((h.decisionOutcome.rows[0] as Row).outcomeAt).toBeNull(); // still pending
    });

    it('after 24h of silence the sweep closes the pending decision as a REAL LOSS and feeds outcome=0 to the bandit', async () => {
      const h = buildHarness();
      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:k1'));
      (h.decisionOutcome.rows[0] as Row).createdAt = new Date(Date.now() - 25 * HOURS);

      const summary = await h.scheduler.sweepActiveWorkspaces();

      expect(summary).toMatchObject({
        skipped: false,
        sweptCount: 1,
        byWorkspace: [{ workspaceId: 'ws-1', swept: 1 }],
      });
      const row = h.decisionOutcome.rows[0] as Row;
      expect(row.outcomeAt).toBeInstanceOf(Date);
      expect(row.outcomeName).toBe('inbound.silent_24h');
      expect(row.wonVsBaseline).toBe(false);
      expect(h.bandit.recordOutcome).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        decisionType: 'chat_reply',
        arm: 'engage',
        outcome: 0,
      });
    });

    it('a next inbound message closes the pending decision as a REAL WIN (chat.continued, outcome=1) — workspace-scoped', async () => {
      const h = buildHarness();
      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:k1'));
      await h.service.recordDecision(recordInput('ws-2', 'chat:ws-2:k1'));

      // The reply engine fires this at the START of the next reply for ws-1
      // (kloel-reply-engine.service.ts → closeOpenChatRepliesAsContinued).
      closeOpenChatRepliesAsContinued(h.service, silentLogger, { workspaceId: 'ws-1' });
      await flush();

      const ws1 = h.decisionOutcome.rows[0] as Row;
      const ws2 = h.decisionOutcome.rows[1] as Row;
      expect(ws1.outcomeName).toBe('chat.continued');
      expect(ws1.wonVsBaseline).toBe(true);
      expect(ws1.outcomeAt).toBeInstanceOf(Date);
      expect(ws2.outcomeAt).toBeNull(); // cross-workspace isolation (plan invariant 1)
      expect(h.bandit.recordOutcome).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        decisionType: 'chat_reply',
        arm: 'engage',
        outcome: 1,
      });
    });

    it('a continuation-WON decision is never re-swept as a loss (close-at-most-once, plan invariant 5)', async () => {
      const h = buildHarness();
      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:k1'));

      closeOpenChatRepliesAsContinued(h.service, silentLogger, { workspaceId: 'ws-1' });
      await flush();
      (h.decisionOutcome.rows[0] as Row).createdAt = new Date(Date.now() - 25 * HOURS);

      const summary = await h.scheduler.sweepActiveWorkspaces();

      expect(summary.sweptCount).toBe(0);
      const row = h.decisionOutcome.rows[0] as Row;
      expect(row.outcomeName).toBe('chat.continued'); // WIN preserved
      expect(row.wonVsBaseline).toBe(true);
    });
  });
});
