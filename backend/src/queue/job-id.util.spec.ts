import { buildQueueJobId, buildQueueDedupId } from './job-id.util';

describe('buildQueueJobId', () => {
  it('joins prefix and parts with __ separator', () => {
    expect(buildQueueJobId('flow', 'workspace-1', 'contact-2')).toBe(
      'flow__workspace-1__contact-2',
    );
  });

  it('replaces invalid characters with underscores', () => {
    expect(buildQueueJobId('flow', 'hello world', 'a@b')).toBe('flow__hello_world__a_b');
  });

  it('collapses consecutive separators', () => {
    expect(buildQueueJobId('flow', 'a!!!b', 'c###d')).toBe('flow__a_b__c_d');
  });

  it('strips leading/trailing underscores from parts', () => {
    expect(buildQueueJobId('___flow___', '___data___')).toBe('flow__data');
  });

  it('returns na for empty parts', () => {
    expect(buildQueueJobId('flow', '')).toBe('flow__na');
  });

  it('handles null and undefined parts', () => {
    expect(buildQueueJobId('flow', null)).toBe('flow__na');
    expect(buildQueueJobId('flow', undefined)).toBe('flow__na');
  });

  it('handles numeric parts', () => {
    expect(buildQueueJobId('flow', 42, 7)).toBe('flow__42__7');
  });

  it('handles boolean parts', () => {
    expect(buildQueueJobId('flow', true)).toBe('flow__true');
  });

  it('truncates very long parts to 80 chars', () => {
    const long = 'a'.repeat(100);
    const result = buildQueueJobId('flow', long);
    expect(result.length).toBeLessThanOrEqual(86);
    expect(result).toMatch(/^flow__a{76,80}$/);
  });
});

describe('buildQueueDedupId', () => {
  it('produces same result as buildQueueJobId', () => {
    expect(buildQueueDedupId('flow', 'ws-1', 'c-2')).toBe('flow__ws-1__c-2');
  });
});
