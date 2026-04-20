import { buildTimestampedRuntimeId, buildTimestampedRuntimeKey } from './kloel-id.util';

describe('kloel-id.util', () => {
  it('builds underscore-delimited runtime ids with UUID entropy', () => {
    expect(buildTimestampedRuntimeId('trace_status')).toMatch(/^trace_status_\d+_[a-f0-9]{8}$/i);
  });

  it('builds colon-delimited runtime keys with UUID entropy', () => {
    expect(buildTimestampedRuntimeKey('memory', 6)).toMatch(/^memory:\d+:[a-f0-9]{6}$/i);
  });
});
