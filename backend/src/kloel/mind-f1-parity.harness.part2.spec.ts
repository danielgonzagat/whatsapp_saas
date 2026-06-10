/**
 * MIND_UNIFICATION_PLAN §7 F0–F1 — parity harness, part 2 (all-flags-OFF
 * regression half; split from `mind-f1-parity.harness.spec.ts` for the CI
 * max_new_file_lines guardrail — no test changed or dropped).
 *
 * Runs the REAL `DecisionOutcomeService` + `DecisionSweepScheduler` against
 * the same STATEFUL in-memory ledger as part 1 (shared via
 * `mind-f1-parity.harness.fixtures.ts`) with ALL F1/F2 flags at their default
 * (OFF): zero behavior drift vs today's immediate-WIN path.
 *
 * @see docs/architecture/MIND_UNIFICATION_PLAN.md (§7 F1/F2, Apêndice A)
 * @see docs/architecture/MIND_F1_FLAGON_RUNBOOK.md (prod flip runbook)
 */
import { closeOpenChatRepliesAsContinued } from './real-reward-signal.flag';
import {
  recordChatReplyDecision,
  closeChatReplyOutcome,
} from './kloel-reply-engine.decision-outcome.helpers';
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
  describe('regressão zero — todas as flags F1/F2 OFF (default) mantém o comportamento atual', () => {
    it("today's reply path: record + immediate WIN close on the canonical ledger; RAC_MindPolicy is NEVER touched", async () => {
      const h = buildHarness();

      // Exactly what the reply engine does with the flag OFF: record at reply
      // start, close as chat.replied/won immediately on success.
      recordChatReplyDecision(h.service, silentLogger, {
        workspaceId: 'ws-1',
        outcomeKey: 'chat:ws-1:k1',
        surface: 'dashboard',
        messageLength: 3,
      });
      await flush();
      closeChatReplyOutcome(h.service, silentLogger, {
        outcomeKey: 'chat:ws-1:k1',
        outcomeName: 'chat.replied',
        wonVsBaseline: true,
      });
      await flush();

      const row = h.decisionOutcome.rows[0] as Row;
      expect(row.outcomeName).toBe('chat.replied');
      expect(row.wonVsBaseline).toBe(true);
      expect(row.outcomeAt).toBeInstanceOf(Date);
      expect(h.bandit.recordOutcome).toHaveBeenCalledWith(
        expect.objectContaining({ arm: 'engage', outcome: 1 }),
      );
      // Dual-write OFF → the parallel ledger does not exist for this path.
      expect(h.mindPolicy.rows).toHaveLength(0);
      expect(h.mindPolicy.findFirst).not.toHaveBeenCalled();
      expect(h.mindPolicy.create).not.toHaveBeenCalled();
      expect(h.mindPolicy.updateMany).not.toHaveBeenCalled();
    });

    it('sweep scheduler is a pure no-op: no enumeration query, aged open rows untouched', async () => {
      const h = buildHarness();
      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:k1'));
      (h.decisionOutcome.rows[0] as Row).createdAt = new Date(Date.now() - 25 * HOURS);
      h.decisionOutcome.findMany.mockClear();

      const summary = await h.scheduler.sweepActiveWorkspaces();

      expect(summary).toEqual({
        skipped: true,
        scannedWorkspaces: 0,
        sweptCount: 0,
        byWorkspace: [],
      });
      expect(h.decisionOutcome.findMany).not.toHaveBeenCalled();
      expect((h.decisionOutcome.rows[0] as Row).outcomeAt).toBeNull();
    });

    it('continuation closer is a no-op with the flag OFF: open decision untouched, no service call', async () => {
      const h = buildHarness();
      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:k1'));
      const closeSpy = jest.spyOn(h.service, 'closeOpenChatReplies');

      closeOpenChatRepliesAsContinued(h.service, silentLogger, { workspaceId: 'ws-1' });
      await flush();

      expect(closeSpy).not.toHaveBeenCalled();
      expect((h.decisionOutcome.rows[0] as Row).outcomeAt).toBeNull();
      expect(h.decisionOutcome.updateMany).not.toHaveBeenCalled();
    });
  });
});
