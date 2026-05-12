import { MindQualityService } from './mind-quality.service';
import { MindReplayService } from './mind-replay.service';
import { MindSimulatorService } from './mind-simulator.service';
import { MindSyntheticGeneratorService } from './mind-synthetic-generator.service';

describe('MindSimulatorService synthetic generation', () => {
  it('generates a deterministic synthetic scenario through the simulator', () => {
    const service = new MindSimulatorService(
      new MindReplayService(),
      new MindQualityService(),
      new MindSyntheticGeneratorService(),
    );

    const first = service.simulateSyntheticWorkspace('ws-1', 123);
    const second = service.simulateSyntheticWorkspace('ws-1', 123);

    expect(first.workspaceId).toBe('ws-1');
    expect(first.replay.totalDecisions).toBeGreaterThan(0);
    expect(first.decisionDetails).toEqual(second.decisionDetails);
  });
});
