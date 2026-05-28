import { BrainAutonomyService } from './brain-autonomy.service';

describe('BrainAutonomyService', () => {
  it('turns graph recommendations into auditable proposals', async () => {
    const graph = {
      recommendNextActions: jest.fn().mockResolvedValue({
        recommendations: [
          {
            action: 'send_message',
            confidence: 0,
            reason: 'Priorizar correção: 2 falha(s) recentes contra 0 execução(ões).',
          },
          {
            action: 'brain.decide',
            confidence: 1,
            reason: 'Caminho forte: 2 execução(ões) recentes em 2 evento(s).',
          },
        ],
        window: { eventCount: 4, take: 500 },
      }),
    };
    const events = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new BrainAutonomyService(graph as never, events as never);

    const result = await service.propose('ws-1');

    expect(result.status).toBe('ready');
    expect(result.window).toEqual({ eventCount: 4, take: 500 });
    expect(result.proposals).toEqual([
      expect.objectContaining({
        action: 'send_message',
        mode: 'fix',
        requiresHumanApproval: false,
      }),
      expect.objectContaining({
        action: 'brain.decide',
        mode: 'scale',
        requiresHumanApproval: false,
      }),
    ]);
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        intent: 'autonomy.propose',
        action: 'brain.autonomy.propose',
      }),
    );
  });
});
