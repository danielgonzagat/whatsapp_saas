/**
 * Proves the catchup MIND-percept anti-storm guard: live messages always emit,
 * catchup messages emit up to a per-workspace cap per rolling window, and the
 * window resets after it elapses.
 */
import type { InboundMessage } from './inbound-processor.helpers';
import {
  shouldEmitInboundPercept,
  CATCHUP_PERCEPT_CAP,
  CATCHUP_PERCEPT_WINDOW_MS,
  type CatchupPerceptWindow,
} from './inbound-catchup-percept-guard';

const WS = 'ws-1';
const NOW = 1_700_000_000_000;

function msg(ingestMode: InboundMessage['ingestMode'], workspaceId = WS): Pick<
  InboundMessage,
  'ingestMode' | 'workspaceId'
> {
  return { ingestMode, workspaceId };
}

describe('shouldEmitInboundPercept', () => {
  let state: Map<string, CatchupPerceptWindow>;

  beforeEach(() => {
    state = new Map<string, CatchupPerceptWindow>();
  });

  it('always emits for live (non-catchup) messages and never touches state', () => {
    for (let i = 0; i < CATCHUP_PERCEPT_CAP * 3; i += 1) {
      expect(shouldEmitInboundPercept(msg('live'), state, NOW)).toBe(true);
    }
    expect(state.size).toBe(0);
  });

  it('emits for catchup up to the cap then suppresses within the window', () => {
    let emitted = 0;
    for (let i = 0; i < CATCHUP_PERCEPT_CAP + 10; i += 1) {
      if (shouldEmitInboundPercept(msg('catchup'), state, NOW + i)) {
        emitted += 1;
      }
    }
    expect(emitted).toBe(CATCHUP_PERCEPT_CAP);
  });

  it('resets the cap once the rolling window elapses', () => {
    // Exhaust the first window.
    for (let i = 0; i < CATCHUP_PERCEPT_CAP; i += 1) {
      shouldEmitInboundPercept(msg('catchup'), state, NOW);
    }
    expect(shouldEmitInboundPercept(msg('catchup'), state, NOW)).toBe(false);

    // Past the window — a fresh budget.
    const later = NOW + CATCHUP_PERCEPT_WINDOW_MS + 1;
    expect(shouldEmitInboundPercept(msg('catchup'), state, later)).toBe(true);
  });

  it('tracks the cap independently per workspace', () => {
    for (let i = 0; i < CATCHUP_PERCEPT_CAP; i += 1) {
      shouldEmitInboundPercept(msg('catchup', 'ws-a'), state, NOW);
    }
    expect(shouldEmitInboundPercept(msg('catchup', 'ws-a'), state, NOW)).toBe(false);
    // A different workspace still has its full budget.
    expect(shouldEmitInboundPercept(msg('catchup', 'ws-b'), state, NOW)).toBe(true);
  });
});
