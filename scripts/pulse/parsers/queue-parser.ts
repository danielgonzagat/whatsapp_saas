import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

interface JobRef {
  file: string;
  line: number;
  jobName: string;
}

function extractQuotedString(s: string): string | null {
  const m = s.match(/['"`]([^'"`]+)['"`]/);
  return m ? m[1] : null;
}

export function checkQueues(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // ---- Collect producers (.add('jobName') in backend) ----
  const producers: JobRef[] = [];

  const backendFiles = walkFiles(config.backendDir, ['.ts']).filter(f => {
    if (/\.(spec|test|d)\.ts$/.test(f)) return false;
    if (/node_modules/.test(f)) return false;
    return true;
  });

  // Pattern: queue.add('jobName', ...) — must be a simple identifier, not a URL path or template
  const addPattern = /(?:queue|Queue|this\.queue|this\.\w+Queue)\.add\s*\(\s*['"]([a-zA-Z][a-zA-Z0-9_-]*)['"`]/;

  for (const file of backendFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      // Skip imports
      if (/^import\s/.test(trimmed)) continue;

      const m = trimmed.match(addPattern);
      if (!m) continue;

      // Skip if there's a PULSE:OK annotation on the same line or the preceding line
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      if (/PULSE:OK/.test(trimmed) || /PULSE:OK/.test(prevLine)) continue;

      // Verify this looks like a queue.add() call, not Array.add or Set.add or similar
      // A BullMQ queue.add call typically appears on a queue-like variable
      const beforeAdd = trimmed.slice(0, trimmed.indexOf('.add('));
      // Heuristic: skip if it looks like a DOM or collection method
      if (/\b(?:classList|eventListeners|listeners|subscribers|middlewares|routes|providers|imports|exports|controllers|interceptors|pipes|guards|filters|modules)\b/.test(beforeAdd)) {
        continue;
      }

      const jobName = m[1];
      // Skip if job name looks like a variable (no spaces, not too long, looks like a slug/name)
      if (jobName.length === 0 || jobName.length > 80) continue;

      producers.push({ file, line: i + 1, jobName });
    }
  }

  // ---- Collect consumers (case 'jobName': or job.name === 'jobName' in worker) ----
  const consumers: JobRef[] = [];

  const workerFiles = walkFiles(config.workerDir, ['.ts']).filter(f => {
    if (/\.(spec|test|d)\.ts$/.test(f)) return false;
    if (/node_modules/.test(f)) return false;
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
  const isJobProcessorFile = /new\s+Worker\s*\(|\.process\s*\(|@Process\s*\(|job\.name\s*===|job\.data\b/.test;

  for (const file of workerFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    // Only scan switch-case consumers in files that look like BullMQ processors
    const fileIsProcessor = isJobProcessorFile(content);

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

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
      if (m) { consumers.push({ file, line: i + 1, jobName: m[1] }); continue; }

      m = trimmed.match(processDecoratorPattern);
      if (m) { consumers.push({ file, line: i + 1, jobName: m[1] }); continue; }
    }
  }

  // ---- Cross-reference ----
  const producerJobNames = new Set(producers.map(p => p.jobName));
  const consumerJobNames = new Set(consumers.map(c => c.jobName));

  // Deduplicate producers by jobName to avoid spamming the same job name from multiple callers
  const reportedProducerMissing = new Set<string>();
  const reportedConsumerMissing = new Set<string>();

  // Producer has no consumer
  for (const prod of producers) {
    if (consumerJobNames.has(prod.jobName)) continue;
    if (reportedProducerMissing.has(prod.jobName)) continue;
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
    if (producerJobNames.has(cons.jobName)) continue;
    if (reportedConsumerMissing.has(cons.jobName)) continue;
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
