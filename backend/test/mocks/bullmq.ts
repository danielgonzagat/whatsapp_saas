// Jest E2E mock for bullmq
// Avoids opening real Redis connections/timers.

export class Job {}

class DummyQueue {
  name: string;

  constructor(name?: string, ..._args: any[]) {
    this.name = name || 'dummy';
  }

  add = async () => undefined;
  close = async () => undefined;

  on = () => undefined;

  getJobCounts = async () => ({ waiting: 0, active: 0, delayed: 0, failed: 0 });
  getJob = async () => null;
  getJobs = async () => [];

  clean = async () => [];
  drain = async () => undefined;
}

/** Queue. */
export class Queue extends DummyQueue {}
/** Queue events. */
export class QueueEvents extends DummyQueue {
  close = async () => undefined;
}
/** Worker. */
export class Worker extends DummyQueue {
  close = async () => undefined;
}
