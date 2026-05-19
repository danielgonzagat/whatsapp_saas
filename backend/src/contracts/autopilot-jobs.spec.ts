import {
  AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB,
  buildSweepUnreadConversationsJobData,
  parseSweepUnreadConversationsJobData,
} from './autopilot-jobs';

describe('autopilot job contracts', () => {
  it('parses sweep unread conversations payloads for backend/worker parity', () => {
    expect(
      parseSweepUnreadConversationsJobData({
        workspaceId: 'ws-1',
        runId: 'run-1',
        limit: 2500,
        mode: 'reply_only_new',
        triggeredBy: 'operator',
      }),
    ).toEqual({
      workspaceId: 'ws-1',
      runId: 'run-1',
      limit: 2000,
      mode: 'reply_only_new',
      triggeredBy: 'operator',
    });
  });

  it('keeps the backend producer builder on the same parser contract', () => {
    expect(
      buildSweepUnreadConversationsJobData({
        workspaceId: 'ws-1',
        runId: 'run-2',
        limit: -1,
        mode: null,
      }),
    ).toEqual({
      workspaceId: 'ws-1',
      runId: 'run-2',
      limit: 1,
      mode: 'reply_all_recent_first',
    });
  });

  it('fails closed when required sweep identifiers are missing', () => {
    expect(() =>
      parseSweepUnreadConversationsJobData({
        workspaceId: 'ws-1',
        job: AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB,
      }),
    ).toThrow('Missing required field "runId"');
  });
});
