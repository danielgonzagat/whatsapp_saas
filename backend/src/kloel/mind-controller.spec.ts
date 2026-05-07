import { MindController } from './mind-controller';
import { MindBeliefService } from './mind-belief.service';
import { MindPolicyService } from './mind-policy.service';
import { MindService } from './mind.service';
import { MindVerbalizerService } from './mind-verbalizer.service';
import type { AggressivenessDto, DecideDto, ResolveDto } from './mind-controller.dto';
import { MindObservabilityService } from './mind-observability.service';

function mockBeliefs(): jest.Mocked<MindBeliefService> {
  const service = Object.create(MindBeliefService.prototype) as jest.Mocked<MindBeliefService>;
  service.list = jest.fn();
  return service;
}

function mockPolicy(): jest.Mocked<MindPolicyService> {
  const service = Object.create(MindPolicyService.prototype) as jest.Mocked<MindPolicyService>;
  service.choose = jest.fn();
  service.harness = jest.fn();
  service.resolveOutcome = jest.fn();
  return service;
}

function mockMind(): jest.Mocked<MindService> {
  const service = Object.create(MindService.prototype) as jest.Mocked<MindService>;
  service.tick = jest.fn().mockResolvedValue({ perceived: 1 });
  service.lift = jest.fn();
  service.resolveAudioVsText = jest.fn().mockResolvedValue({
    choice: 'text',
    confidence: 0.5,
    fallback: false,
  });
  service.resolveCoupon = jest.fn().mockResolvedValue({
    action: 'offer_coupon',
    confidence: 0.5,
    fallback: false,
  });
  service.resolveAggressiveness = jest.fn().mockResolvedValue({
    aggressiveness: 'MEDIUM',
    confidence: 0.72,
    fallback: false,
  });
  service.resolveTone = jest.fn().mockResolvedValue({
    confidence: 0.5,
    fallback: false,
    tone: 'DIRECT',
  });
  return service;
}

function mockVerbalizer(): jest.Mocked<MindVerbalizerService> {
  const service = Object.create(
    MindVerbalizerService.prototype,
  ) as jest.Mocked<MindVerbalizerService>;
  service.narrate = jest.fn().mockResolvedValue('briefing');
  return service;
}

function mockObservability(): jest.Mocked<MindObservabilityService> {
  const service = Object.create(
    MindObservabilityService.prototype,
  ) as jest.Mocked<MindObservabilityService>;
  service.ask = jest.fn();
  service.bandit = jest.fn();
  service.briefing = jest.fn();
  service.concepts = jest.fn();
  service.health = jest.fn();
  service.lift = jest.fn();
  service.report = jest.fn();
  service.state = jest.fn();
  service.surprise = jest.fn();
  service.trace = jest.fn();
  return service;
}

function buildController(params?: {
  beliefs?: jest.Mocked<MindBeliefService>;
  mind?: jest.Mocked<MindService>;
  policy?: jest.Mocked<MindPolicyService>;
  verbalizer?: jest.Mocked<MindVerbalizerService>;
}): MindController {
  return new MindController(
    params?.beliefs ?? mockBeliefs(),
    params?.policy ?? mockPolicy(),
    params?.mind ?? mockMind(),
    params?.verbalizer ?? mockVerbalizer(),
    mockObservability(),
  );
}

describe('MindController', () => {
  it('exposes tick and narration through the service layer', async () => {
    const controller = buildController();

    await expect(controller.tick('ws-1')).resolves.toEqual({ perceived: 1 });
    await expect(controller.narrate('ws-1')).resolves.toEqual({ briefing: 'briefing' });
  });

  it('propagates tick and narrate service failures', async () => {
    const mind = mockMind();
    const verbalizer = mockVerbalizer();
    const tickError = new Error('tick_failed');
    const narrateError = new Error('narrate_failed');
    mind.tick.mockRejectedValueOnce(tickError);
    verbalizer.narrate.mockRejectedValueOnce(narrateError);

    const controller = buildController({ mind, verbalizer });

    await expect(controller.tick('ws-1')).rejects.toThrow(tickError);
    await expect(controller.narrate('ws-1')).rejects.toThrow(narrateError);
  });

  it('passes workspace id through tick and narrate exactly', async () => {
    const mind = mockMind();
    const verbalizer = mockVerbalizer();
    const controller = buildController({ mind, verbalizer });

    await controller.tick('ws-exact');
    await controller.narrate('ws-exact');

    expect(mind.tick).toHaveBeenCalledWith('ws-exact');
    expect(verbalizer.narrate).toHaveBeenCalledWith('ws-exact');
  });

  it('delegates decide body to policy.choose with workspaceId', async () => {
    const policy = mockPolicy();
    const body: DecideDto = {
      context: {},
      decisionType: 'cia_aggressiveness',
      options: [{ action: 'test', context: {}, predicate: 'p' }],
      subject: 'x',
    };
    policy.choose.mockResolvedValue({ chosen: 'test', decision: {} as never });

    const controller = buildController({ policy });
    await controller.decide('ws-1', body);

    expect(policy.choose).toHaveBeenCalledWith({ workspaceId: 'ws-1', ...body });
  });

  it('delegates resolve body to policy.resolveOutcome', async () => {
    const policy = mockPolicy();
    const body: ResolveDto = { outcome: 0.5, outcomeKey: 'k1' };

    const controller = buildController({ policy });
    const result = await controller.resolve('ws-1', body);

    expect(policy.resolveOutcome).toHaveBeenCalledWith('ws-1', 'k1', 0.5, undefined);
    expect(result).toEqual({ ok: true });
  });

  it('delegates aggressiveness body to mind.resolveAggressiveness', async () => {
    const mind = mockMind();
    const body: AggressivenessDto = {
      domain: 'whatsapp_sales',
      repliedRate: 0.4,
      revenuePerSignal: 9.99,
      soldRate: 0.12,
    };

    const controller = buildController({ mind });
    const result = await controller.aggressiveness('ws-1', body);

    expect(mind.resolveAggressiveness).toHaveBeenCalledWith(
      'ws-1',
      'whatsapp_sales',
      0.12,
      0.4,
      9.99,
    );
    expect(result).toEqual({ aggressiveness: 'MEDIUM', confidence: 0.72, fallback: false });
  });

  it('delegates additional MIND decisions through dedicated endpoints', async () => {
    const mind = mockMind();
    const controller = buildController({ mind });

    await controller.audioVsText('ws-1', { audioRatio: 0.2, channel: 'instagram' });
    await controller.tone('ws-1', {
      channel: 'whatsapp',
      repliedRate: 0.4,
      segment: 'premium',
      soldRate: 0.2,
    });
    await controller.coupon('ws-1', {
      priceBand: 'over_300',
      segment: 'premium',
      soldRate: 0.08,
    });

    expect(mind.resolveAudioVsText).toHaveBeenCalledWith('ws-1', 'instagram', 0.2);
    expect(mind.resolveTone).toHaveBeenCalledWith('ws-1', 'whatsapp', 0.4, 0.2, 'premium');
    expect(mind.resolveCoupon).toHaveBeenCalledWith('ws-1', 'over_300', 0.08, 'premium');
  });
});
