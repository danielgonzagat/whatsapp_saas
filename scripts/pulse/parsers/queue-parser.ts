import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

interface JobRef {
  file: string;
  line: number;
  jobName: string;
}

function extractQuotedString(s: string): string | null {
  const m = s.match(/['"`]([^'"`]+)['"`]/);
  return m ? m[1] : null;
}

/** Check queues. */
export function checkQueues(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // ---- Collect producers (.add('jobName') in backend) ----
  const producers: JobRef[] = [];

  const backendFiles = walkFiles(config.backendDir, ['.ts']).filter((f) => {
    if (/\.(spec|test|d)\.ts$/.test(f)) {
      return false;
    }
    if (/node_modules/.test(f)) {
      return false;
    }
    return true;
  });

  // Pattern: queue.add('jobName', ...) — must be a simple identifier, not a URL path or template
  // Matches: queue.add, Queue.add, this.queue.add, this.someQueue.add, someQueue.add, myQueueRef.add
  const addPatternSameLine =
    /(?:\w*[Qq]ueue\w*|this\.\w+)\.add\s*\(\s*['"]([a-zA-Z][a-zA-Z0-9_-]*)['"`]/;
  // Pattern for when .add( is on one line and the job name string is on the next line
  const addPatternOpenParen = /(?:\w*[Qq]ueue\w*|this\.\w+)\.add\s*\(\s*$/;
  const jobNameOnlyPattern = /^\s*['"]([a-zA-Z][a-zA-Z0-9_-]*)['"`]\s*,?\s*$/;

  // Also look in worker dir (worker can self-enqueue)
  const allSourceFiles = [...backendFiles];
  if (config.workerDir) {
    allSourceFiles.push(
      ...walkFiles(config.workerDir, ['.ts']).filter((f) => {
        if (/\.(spec|test|d)\.ts$/.test(f)) {
          return false;
        }
        if (/node_modules/.test(f)) {
          return false;
        }
        return true;
      }),
    );
  }

  for (const file of allSourceFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }
      // Skip imports
      if (/^import\s/.test(trimmed)) {
        continue;
      }

      // Skip if there's a PULSE:OK annotation on the same line or the preceding line
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      if (/PULSE:OK/.test(trimmed) || /PULSE:OK/.test(prevLine)) {
        continue;
      }

      let jobName: string | null = null;

      // Try same-line pattern first
      const m = trimmed.match(addPatternSameLine);
      if (m) {
        jobName = m[1];
      } else if (addPatternOpenParen.test(trimmed)) {
        // Multi-line: .add( on this line, job name on next line
        const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
        const mNext = nextLine.match(jobNameOnlyPattern);
        if (mNext) {
          jobName = mNext[1];
        }
      }

      if (!jobName) {
        continue;
      }

      // Verify this looks like a queue.add() call, not Array.add or Set.add or similar
      const addIdx = trimmed.indexOf('.add(');
      if (addIdx >= 0) {
        const beforeAdd = trimmed.slice(0, addIdx);
        // Heuristic: skip if it looks like a DOM or collection method
        if (
          /\b(?:classList|eventListeners|listeners|subscribers|middlewares|routes|providers|imports|exports|controllers|interceptors|pipes|guards|filters|modules)\b/.test(
            beforeAdd,
          )
        ) {
          continue;
        }
      }

      // Skip if job name is too long or empty
      if (jobName.length === 0 || jobName.length > 80) {
        continue;
      }

      producers.push({ file, line: i + 1, jobName });
    }
  }

  // ---- Collect consumers (case 'jobName': or job.name === 'jobName' in worker) ----
  const consumers: JobRef[] = [];

  const workerFiles = walkFiles(config.workerDir, ['.ts']).filter((f) => {
    if (/\.(spec|test|d)\.ts$/.test(f)) {
      return false;
    }
    if (/node_modules/.test(f)) {
      return false;
    }
    return true;
  });

  // Patterns for worker processors:
  // case 'jobName':
  // job.name === 'jobName'
  // job.name === "jobName"
  // Also: @Process('jobName') in NestJS BullMQ decorators
  const casePattern = /^\s*case\s+['"`]([^'"`]+)['"`]\s*:/;
  const jobNameEqPattern = /\bjob\.name\s*===\s*['"`]([^'"`]+)['"`]/;
  const processDecoratorPattern = /@Process\s*\(\s*['"`]([^'"`]+)['"`]/;

  // To avoid false positives, we only flag case statements that appear in a BullMQ job processor context.
  // A BullMQ processor context is identified by surrounding patterns like:
  //   - A Worker constructor call in the file
  //   - A function that takes (job: Job) as parameter
  //   - The function is passed as the second arg to new Worker(...)
  // Heuristic: only count case statements as job consumers if the file contains Worker constructor usage
  // OR if a job.name comparison is present (which is unambiguously job processing).
  const jobProcessorPattern =
    /new\s+Worker\s*\(|\.process\s*\(|@Process\s*\(|job\.name\s*===|job\.data\b/;
  const isJobProcessorFile = (content: string) => jobProcessorPattern.test(content);

  for (const file of workerFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    // Only scan switch-case consumers in files that look like BullMQ processors
    const fileIsProcessor = isJobProcessorFile(content);

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      // Skip if PULSE:OK on this or preceding line
      const prevLine2 = i > 0 ? lines[i - 1].trim() : '';
      if (/PULSE:OK/.test(trimmed) || /PULSE:OK/.test(prevLine2)) {
        continue;
      }

      let m: RegExpMatchArray | null;

      // case 'jobName': — only count in files that look like job processors
      if (fileIsProcessor) {
        m = trimmed.match(casePattern);
        if (m) {
          // Additional guard: the case value should look like a BullMQ job name (hyphen-slug or camelCase)
          // and not look like a browser session state (all-caps short status words)
          const jobName = m[1];
          // Skip if it looks like a browser/session state enum value (all-caps, short, no hyphens)
          const isBrowserState = /^[A-Z_]{2,20}$/.test(jobName) && !jobName.includes('-');
          if (!isBrowserState) {
            consumers.push({ file, line: i + 1, jobName });
          }
          continue;
        }
      }

      m = trimmed.match(jobNameEqPattern);
      if (m) {
        consumers.push({ file, line: i + 1, jobName: m[1] });
        continue;
      }

      m = trimmed.match(processDecoratorPattern);
      if (m) {
        consumers.push({ file, line: i + 1, jobName: m[1] });
        continue;
      }
    }
  }

  // ---- Collect queue names that have Worker processors (handle all jobs regardless of name) ----
  // Pattern: new Worker("queue-name", async (job) => { ... }) without explicit job.name checks
  const workerQueueNames = new Set<string>();
  const newWorkerSameLinePattern = /new\s+Worker\s*\(\s*['"]([^'"]+)['"]/;
  const newWorkerOpenParenPattern = /new\s+Worker\s*\(\s*$/;
  const quoteStringPattern = /^\s*['"]([^'"]+)['"]/;
  // Also collect: new BullQueue("name", ...) or new Queue("name", ...) → variable name mapping
  const queueDeclPattern =
    /(?:const|let|var|export\s+(?:const|let))\s+(\w+)\s*=\s*new\s+(?:BullQueue|Queue|Bull)\s*\(\s*['"]([^'"]+)['"]/;
  const queueNameByVar = new Map<string, string>();

  const allWorkerAndQueueFiles = [...workerFiles, ...backendFiles];
  for (const file of allWorkerAndQueueFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    for (let j = 0; j < lines.length; j++) {
      const line = lines[j];
      // Same-line Worker constructor
      const wm = line.match(newWorkerSameLinePattern);
      if (wm) {
        workerQueueNames.add(wm[1]);
      } else if (newWorkerOpenParenPattern.test(line.trim())) {
        // Multi-line: new Worker(\n  "queue-name",
        const nextLine = j + 1 < lines.length ? lines[j + 1] : '';
        const nm = nextLine.match(quoteStringPattern);
        if (nm) {
          workerQueueNames.add(nm[1]);
        }
      }
      const qm = line.match(queueDeclPattern);
      if (qm) {
        queueNameByVar.set(qm[1], qm[2]);
      }
    }
  }

  // For each producer, check if the queue variable maps to a queue that has a Worker
  // If so, the job IS consumed (by the generic Worker processor)
  const producersWithWorker = new Set<string>();
  for (const prod of producers) {
    // Extract the queue variable name from the producer line context
    const prodContent = (() => {
      try {
        return readTextFile(prod.file, 'utf8');
      } catch {
        return '';
      }
    })();
    const prodLine = prodContent.split('\n')[prod.line - 1] || '';
    // Look for varName.add( in the line
    const varMatch = prodLine.match(/(\w+)\.add\s*\(/);
    if (varMatch) {
      const varName = varMatch[1];
      const queueName = queueNameByVar.get(varName);
      if (queueName && workerQueueNames.has(queueName)) {
        producersWithWorker.add(prod.jobName);
      }
    }
  }

  // ---- Cross-reference ----
  const producerJobNames = new Set(producers.map((p) => p.jobName));
  const consumerJobNames = new Set(consumers.map((c) => c.jobName));

  // Deduplicate producers by jobName to avoid spamming the same job name from multiple callers
  const reportedProducerMissing = new Set<string>();
  const reportedConsumerMissing = new Set<string>();

  // Producer has no consumer
  for (const prod of producers) {
    if (consumerJobNames.has(prod.jobName)) {
      continue;
    }
    // Skip if the producer's queue has a generic Worker that handles all jobs
    if (producersWithWorker.has(prod.jobName)) {
      continue;
    }
    if (reportedProducerMissing.has(prod.jobName)) {
      continue;
    }
    reportedProducerMissing.add(prod.jobName);

    const relFile = path.relative(config.rootDir, prod.file);
    breaks.push({
      type: 'QUEUE_NO_PROCESSOR',
      severity: 'high',
      file: relFile,
      line: prod.line,
      description: `Queue job '${prod.jobName}' is produced but has no worker processor`,
      detail: `No 'case "${prod.jobName}":' or 'job.name === "${prod.jobName}"' found in worker — jobs will silently pile up`,
    });
  }

  // Consumer has no producer
  for (const cons of consumers) {
    if (producerJobNames.has(cons.jobName)) {
      continue;
    }
    if (reportedConsumerMissing.has(cons.jobName)) {
      continue;
    }
    reportedConsumerMissing.add(cons.jobName);

    const relFile = path.relative(config.rootDir, cons.file);
    breaks.push({
      type: 'PROCESSOR_NO_PRODUCER',
      severity: 'low',
      file: relFile,
      line: cons.line,
      description: `Worker processor handles job '${cons.jobName}' but no producer calls queue.add('${cons.jobName}')`,
      detail: `Dead processor — no backend code enqueues this job name. May be renamed or removed producer.`,
    });
  }

  return breaks;
}
