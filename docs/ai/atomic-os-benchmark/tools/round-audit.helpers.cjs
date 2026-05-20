'use strict';

const fs = require('node:fs');
const path = require('node:path');

const roundDir = process.argv[2] ? path.resolve(process.argv[2]) : '';

function readText(file) {
  try {
    return fs.readFileSync(path.join(roundDir, file), 'utf8');
  } catch {
    return '';
  }
}

function firstExisting(files) {
  return files.find((file) => fs.existsSync(path.join(roundDir, file))) || files[0];
}

function readJsonl(file) {
  const text = readText(file).replace(/\0/g, '').trim();
  if (!text) return [];
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readJsonFile(file) {
  const text = readText(file).trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function metadataValue(...names) {
  for (const name of names) {
    const match = readText('metadata.txt').match(new RegExp('^' + name + '=(.+)$', 'm'));
    if (match) return path.resolve(match[1].trim());
  }
  return '';
}

const roundMetadata = {
  normalWorktree: metadataValue('normal_worktree', 'normal'),
  atomicWorktree: metadataValue('atomic_worktree', 'atomic'),
};
const watchdogStatus = readJsonFile('opencode-watchdog-status.json') || {};

function laneStatus(name) {
  return (watchdogStatus.lanes || []).find((lane) => lane.name === name) || null;
}

function laneStartedAt(name) {
  const value = Number(laneStatus(name)?.startedAt);
  return Number.isFinite(value) ? value : null;
}

function readNumberTextFile(file) {
  const text = readText(file).trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function prepromptMetrics(name) {
  if (!name) return null;
  const prefix = 'opencode-' + name + '-preprompt';
  const startTimestamp = readNumberTextFile(prefix + '-start-ms.txt');
  const endTimestamp = readNumberTextFile(prefix + '-end-ms.txt');
  const exitCode = readNumberTextFile(prefix + '-exit.txt');
  if (startTimestamp === null && endTimestamp === null && exitCode === null) return null;
  return {
    startTimestamp,
    endTimestamp,
    exitCode,
    commandText: readText(prefix + '-command.txt') || readText('opencode-' + name + '-preprompt-command.txt'),
    output: readText(prefix + '-output.log').slice(0, 8000),
  };
}

function finalUsage(events) {
  let usageRecord = {};
  const openCodeTotals = { input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 };
  for (const event of events) {
    if (event.type === 'turn.completed') usageRecord = event.usage || {};
    if (event.type === 'step_finish' && event.part?.tokens) {
      const tokens = event.part.tokens;
      openCodeTotals.input_tokens += Number(tokens.input || 0);
      openCodeTotals.output_tokens += Number(tokens.output || 0);
      openCodeTotals.reasoning_output_tokens += Number(tokens.reasoning || 0);
    }
  }
  if (Object.values(openCodeTotals).some((value) => value > 0)) return openCodeTotals;
  return usageRecord;
}

function eventTimestamp(event) {
  const timestamp = Number(event?.timestamp);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function firstTimestamp(events, predicate = () => true) {
  for (const event of events) {
    if (!predicate(event)) continue;
    const timestamp = eventTimestamp(event);
    if (timestamp !== null) return timestamp;
  }
  return null;
}

function lastTimestamp(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const timestamp = eventTimestamp(events[index]);
    if (timestamp !== null) return timestamp;
  }
  return null;
}

function elapsedMs(start, end) {
  return typeof start === 'number' && typeof end === 'number' ? Math.max(0, end - start) : null;
}

function sectionList(text, label) {
  const start = text.indexOf(`${label}\n`);
  if (start === -1) return [];
  const body = text.slice(start + label.length + 1);
  const next = body.search(/\n[a-z_]+(?:_start|_exit|_short|_diff|_counts|_scan)?(?:=|\n)/);
  const section = next === -1 ? body : body.slice(0, next);
  return section.trim().split(/\s+/).filter(Boolean);
}

function countTraceFiles(worktree) {
  if (!worktree) return null;
  const traceDir = path.join(worktree, '.atomic', 'traces');
  try {
    return fs.readdirSync(traceDir).filter((entry) => entry.endsWith('.json')).length;
  } catch {
    return null;
  }
}


module.exports = {
  roundDir,
  readText,
  firstExisting,
  readJsonl,
  readJsonFile,
  metadataValue,
  laneStatus,
  laneStartedAt,
  readNumberTextFile,
  prepromptMetrics,
  finalUsage,
  eventTimestamp,
  firstTimestamp,
  lastTimestamp,
  elapsedMs,
  sectionList,
  countTraceFiles,
};
