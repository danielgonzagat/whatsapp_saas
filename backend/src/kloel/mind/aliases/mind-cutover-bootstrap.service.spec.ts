/**
 * Proves the cutover bootstrap trigger: no-op when both backfill flags are OFF,
 * runs the enabled backfill + parity on bootstrap, and never throws into boot
 * (errors are caught and logged).
 */
import { MindCutoverBootstrapService } from './mind-cutover-bootstrap.service';

const MSG = 'KLOEL_MINDMESSAGE_BACKFILL';
const MEM = 'KLOEL_MINDMEMORY_BACKFILL';

function flush(): Promise<void> {
  return new Promise((r) => setImmediate(r));
}

describe('MindCutoverBootstrapService', () => {
  const prevMsg = process.env[MSG];
  const prevMem = process.env[MEM];
  afterEach(() => {
    if (prevMsg === undefined) {
      delete process.env[MSG];
    } else {
      process.env[MSG] = prevMsg;
    }
    if (prevMem === undefined) {
      delete process.env[MEM];
    } else {
      process.env[MEM] = prevMem;
    }
  });

  function build() {
    const message = {
      backfill: jest.fn().mockResolvedValue({ scanned: 5, inserted: 5, batches: 1 }),
      parity: jest.fn().mockResolvedValue({ legacy: 5, mirrored: 5, missing: 0, coverage: 1 }),
    };
    const memory = {
      backfill: jest.fn().mockResolvedValue({ scanned: 3, inserted: 3, batches: 1 }),
      parity: jest.fn().mockResolvedValue({ legacy: 3, mirrored: 3, missing: 0, coverage: 1 }),
    };
    const service = new MindCutoverBootstrapService(message as never, memory as never);
    return { service, message, memory };
  }

  it('does nothing when both flags are OFF', async () => {
    delete process.env[MSG];
    delete process.env[MEM];
    const { service, message, memory } = build();
    service.onApplicationBootstrap();
    await flush();
    expect(message.backfill).not.toHaveBeenCalled();
    expect(memory.backfill).not.toHaveBeenCalled();
  });

  it('runs the memory backfill + parity when KLOEL_MINDMEMORY_BACKFILL=true', async () => {
    delete process.env[MSG];
    process.env[MEM] = 'true';
    const { service, memory } = build();
    service.onApplicationBootstrap();
    await flush();
    expect(memory.backfill).toHaveBeenCalledTimes(1);
    expect(memory.parity).toHaveBeenCalledTimes(1);
  });

  it('runs the message backfill with a before-cutoff when KLOEL_MINDMESSAGE_BACKFILL=true', async () => {
    process.env[MSG] = 'true';
    delete process.env[MEM];
    const { service, message } = build();
    service.onApplicationBootstrap();
    await flush();
    expect(message.backfill).toHaveBeenCalledTimes(1);
    const calls = message.backfill.mock.calls as Array<[Record<string, unknown>]>;
    expect(calls[0]?.[0]).toHaveProperty('before');
  });

  it('never throws into boot when a backfill rejects', async () => {
    process.env[MEM] = 'true';
    const message = { backfill: jest.fn(), parity: jest.fn() };
    const memory = {
      backfill: jest.fn().mockRejectedValue(new Error('db down')),
      parity: jest.fn(),
    };
    const service = new MindCutoverBootstrapService(message as never, memory as never);
    expect(() => service.onApplicationBootstrap()).not.toThrow();
    await flush();
    expect(memory.backfill).toHaveBeenCalled();
  });
});
