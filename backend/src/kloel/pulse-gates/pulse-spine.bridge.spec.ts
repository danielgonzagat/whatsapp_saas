import { ValenceTaggerService } from '../mind/valence-tagger.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type { SpineEventEnvelope } from '../spine/spine-event.types';
import { PulseSpineBridge } from './pulse-spine.bridge';
import {
  type GateVerdict,
  fail,
  pass,
} from './pulse-gates.types';

function build(opts: { ringCapacity?: number } = {}) {
  const emitter = new SpineEmitterService(new ValenceTaggerService(), opts);
  const bridge = new PulseSpineBridge(emitter);
  return { emitter, bridge };
}

describe('PulseSpineBridge', () => {
  it('emits pulse.gate_passed for PASS verdict', async () => {
    const { emitter } = build();
    const captured: SpineEventEnvelope[] = [];
    emitter.subscribe((e) => captured.push(e));

    const bridge = new PulseSpineBridge(emitter);
    const verdict: GateVerdict = pass('no-roleplay', 'hard_fail', 'pulse-spine-bridge');

    await bridge.recordVerdict(verdict);

    expect(captured).toHaveLength(1);
    expect(captured[0]?.eventName).toBe('pulse.gate_passed');
    expect(captured[0]?.truthMode).toBe('observed');
    expect(captured[0]?.provenance.processor).toBe('pulse-spine-bridge');
    expect(captured[0]?.provenance.processorVersion).toBe('1.0.0');
    expect(captured[0]?.provenance.schemaVersion).toBe('1.0.0');
    expect(captured[0]?.provenance.source).toBe('production');
    expect(captured[0]?.payload).toEqual({
      gateName: 'no-roleplay',
      mode: 'hard_fail',
      reason: undefined,
    });
  });

  it('emits pulse.gate_failed for FAIL verdict with reason', async () => {
    const { emitter } = build();
    const captured: SpineEventEnvelope[] = [];
    emitter.subscribe((e) => captured.push(e));

    const bridge = new PulseSpineBridge(emitter);
    const evidence = [{ path: 'abi.json', detail: 'instructional string detected' }];
    const verdict: GateVerdict = fail(
      'prompt-leakage',
      'hard_fail',
      'prompt-leakage.gate',
      'instructional text detected: "you are" at byte 42',
      evidence,
    );

    await bridge.recordVerdict(verdict);

    expect(captured).toHaveLength(1);
    expect(captured[0]?.eventName).toBe('pulse.gate_failed');
    expect(captured[0]?.payload).toEqual({
      gateName: 'prompt-leakage',
      mode: 'hard_fail',
      reason: 'instructional text detected: "you are" at byte 42',
      evidence,
    });
  });

  it('propagates workspaceId to spine envelope', async () => {
    const { emitter } = build();
    const captured: SpineEventEnvelope[] = [];
    emitter.subscribe((e) => captured.push(e));

    const bridge = new PulseSpineBridge(emitter);
    const verdict: GateVerdict = pass('lineage-integrity', 'hard_fail', 'lineage-integrity.gate');

    await bridge.recordVerdict(verdict, { workspaceId: 'wks_gamma' });

    expect(captured[0]?.workspaceId).toBe('wks_gamma');
  });

  it('propagates correlationId to spine envelope', async () => {
    const { emitter } = build();
    const captured: SpineEventEnvelope[] = [];
    emitter.subscribe((e) => captured.push(e));

    const bridge = new PulseSpineBridge(emitter);
    const verdict: GateVerdict = pass('no-overclaim', 'log_only', 'no-overclaim.gate');

    await bridge.recordVerdict(verdict, { correlationId: 'corr_alpha' });

    expect(captured[0]?.correlationId).toBe('corr_alpha');
  });

  it('session log_onlyFAIL still emits pulse.gate_failed', async () => {
    const { emitter } = build();
    const captured: SpineEventEnvelope[] = [];
    emitter.subscribe((e) => captured.push(e));

    const bridge = new PulseSpineBridge(emitter);
    const verdict: GateVerdict = fail(
      'truth-mode-honesty',
      'log_only',
      'truth-mode-honesty.gate',
      'mistagged observed as inferred',
    );

    await bridge.recordVerdict(verdict);

    expect(captured).toHaveLength(1);
    expect(captured[0]?.eventName).toBe('pulse.gate_failed');
    expect(captured[0]?.payload?.mode).toBe('log_only');
  });

  it('emission without opts leaves workspaceId undefined', async () => {
    const { emitter } = build();
    const captured: SpineEventEnvelope[] = [];
    emitter.subscribe((e) => captured.push(e));

    const bridge = new PulseSpineBridge(emitter);
    const verdict: GateVerdict = pass('evidence-provenance', 'hard_fail', 'evidence-provenance.gate');

    await bridge.recordVerdict(verdict);

    expect(captured[0]?.workspaceId).toBeUndefined();
  });
});
