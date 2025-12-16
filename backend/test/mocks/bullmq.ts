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

export class Queue extends DummyQueue {}
export class QueueEvents extends DummyQueue {
  close = async () => undefined;
}
export class Worker extends DummyQueue {
  close = async () => undefined;
}
