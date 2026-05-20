'use strict';

const path = require('node:path');
const { readText, countTraceFiles } = require('./round-audit.helpers.cjs');

function validationMetrics(file, worktree = '') {
  const text = readText(file);
  const lines = text.split(/\r?\n/);
  const keyedNumber = (name) => {
    const match = text.match(new RegExp('^' + name + '=([^\\n]*)', 'm'));
    if (!match) return null;
    const raw = match[1].trim();
    if (!raw) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const status = (name) => {
    const variants = [
      name,
      name.replace(/_/g, ' '),
      name.replace(/_/g, '-'),
    ];
    for (const variant of variants) {
      const bracketMatch = text.match(new RegExp(
        '\\[\\s*' + variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+(?:status|exit|done)=([0-9]+)\\s*\\]',
        'i',
      ));
      if (bracketMatch) return Number(bracketMatch[1]);
    }
    const match = text.match(new RegExp(
      '(?:' + name + '_status|' + name + '_exit|' + name + '_done)=([0-9]+)',
    ));
    return match ? Number(match[1]) : null;
  };
  const sectionMarkers = new Set([
    'git_status_short',
    'touched_kloel_files',
    'jest_start',
    'typecheck_start',
    'diff_check_start',
    'atomic_trace_isolation',
    'service_line_count',
    'unified_agent_file_line_counts',
    'line_counts',
    'spec_diff',
    'protected_diff',
    'forbidden_pattern_scan',
    'suppression_scan',
    'helper_this_scan',
    'private_methods_scan',
    'private_scan',
    'diff_numstat',
    'diff_stat',
    'untracked_line_counts',
    'atomic_trace_counts',
    'trace_count',
    'focused_jest',
    'focused_eslint',
    'touched_typecheck_errors',
    'unexpected_private_helper_removal_scan',
  ]);
  const sectionName = (value) =>
    String(value || '')
      .trim()
      .replace(/^\[\s*/, '')
      .replace(/\s*\]$/, '')
      .replace(/^==\s*/, '')
      .replace(/\s*==$/, '')
      .replace(/\s+/g, '_');
  const isExternalHeading = (value) => /^==\s*.+\s*==$/.test(String(value || '').trim());
  const section = (name) => {
    const normalizedName = sectionName(name);
    const index = lines.findIndex((line) => sectionName(line) === normalizedName);
    if (index === -1) return [];
    const values = [];
    for (const rawLine of lines.slice(index + 1)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^\[.*\b(?:status|exit|done)=[0-9]+\s*\]$/i.test(line)) break;
      if (isExternalHeading(line) || sectionMarkers.has(sectionName(line)) || /^[a-z_]+=(.*)$/.test(line)) break;
      values.push(line);
    }
    return values;
  };
  const lineMatch = text.match(/\n\s*(\d+)\s+.*backend\/src\/kloel\/unified-agent\.service\.ts/);
  const traceMatch =
    text.match(/worktree_dot_atomic_traces=(\d+)/) ||
    text.match(/worktree_traces=(\d+)/) ||
    text.match(/"worktreeTraceCount":\s*(\d+)/) ||
    text.match(/\ntrace_count\n\s*(\d+)/);
  const docsTraceMatch = text.match(/worktree_docs_ai_traces=(\d+)/);
  const worktreeTraceCount = countTraceFiles(worktree);
  const typecheckErrorLines = [
    ...section('typecheck'),
    ...section('touched_typecheck_errors'),
  ].filter((line) => /\berror TS\d+/.test(line));
  const typecheckKloelErrors = typecheckErrorLines.filter(
    (line) => line.includes('src/kloel/') || line.includes('backend/src/kloel/'),
  );
  const touchedTypecheckErrorCount = keyedNumber('touched_typecheck_error_count');
  const gitStatusEntries = [...section('git_status_short'), ...section('git_status')]
    .map((line) => {
      const match = line.match(/^(.{1,2})\s+(.+)$/);
      if (!match) return null;
      return { status: match[1].trim(), path: match[2] };
    })
    .filter((entry) => entry && entry.path.includes('backend/src/kloel'));
  const touchedKloelFiles = [
    ...new Set([
      ...section('touched_kloel_files'),
      ...gitStatusEntries.map((entry) => entry.path),
    ]),
  ].sort();
  const sourceNumstat = section('diff_numstat')
    .map((line) => {
      const match = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
      if (!match) return null;
      return {
        insertions: match[1] === '-' ? 0 : Number(match[1]),
        deletions: match[2] === '-' ? 0 : Number(match[2]),
        path: match[3],
      };
    })
    .filter((row) => row && row.path.includes('backend/src/kloel'));
  const fileLineCounts = [...section('unified_agent_file_line_counts'), ...section('line_counts')]
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (!match || match[2] === 'total') return null;
      const matchedPath = match[2];
      const kloelIndex = matchedPath.indexOf('backend/src/kloel/');
      const normalizedPath = kloelIndex === -1 ? matchedPath : matchedPath.slice(kloelIndex);
      return { lines: Number(match[1]), path: normalizedPath };
    })
    .filter((row) => row && row.path.includes('backend/src/kloel'));
  const untrackedPathSet = new Set(
    gitStatusEntries.filter((entry) => entry.status === '??').map((entry) => entry.path),
  );
  const untrackedInsertions = fileLineCounts
    .filter((row) => untrackedPathSet.has(row.path))
    .reduce((sum, row) => sum + row.lines, 0);
  const sourceInsertions =
    sourceNumstat.reduce((sum, row) => sum + row.insertions, 0) + untrackedInsertions;
  const sourceDeletions = sourceNumstat.reduce((sum, row) => sum + row.deletions, 0);
  const actionHelperLines =
    fileLineCounts.find((row) => row.path.endsWith('unified-agent-action.helpers.ts'))?.lines ?? null;
  const runtimeHelperLines =
    fileLineCounts.find((row) => row.path.endsWith('unified-agent-runtime.helpers.ts'))?.lines ?? null;
  const runtimeContextHelperLines =
    fileLineCounts.find((row) => row.path.endsWith('unified-agent-runtime-context.helpers.ts'))?.lines ?? null;
  const toolRouterHelperLines =
    fileLineCounts.find((row) => row.path.endsWith('unified-agent-tool-router.helpers.ts'))?.lines ?? null;
  const totalKloelLines = fileLineCounts.reduce((sum, row) => sum + row.lines, 0);
  const unexpectedPrivateHelperRemovalStatus = status('unexpected_private_helper_removal_scan');
  const scopePreservationPass =
    unexpectedPrivateHelperRemovalStatus === null ? null : unexpectedPrivateHelperRemovalStatus === 0;
  const serviceLines =
    fileLineCounts.find((row) => row.path.endsWith('unified-agent.service.ts'))?.lines ??
    (lineMatch ? Number(lineMatch[1]) : null);
  return {
    jestStatus: status('jest'),
    finalValidationStatus: status('final_validation'),
    typecheckStatus: status('typecheck'),
    typecheckErrorCount: Math.max(typecheckErrorLines.length, touchedTypecheckErrorCount ?? 0),
    typecheckKloelErrorCount: touchedTypecheckErrorCount ?? typecheckKloelErrors.length,
    lintStatus: status('lint') ?? status('eslint') ?? status('lint_touched_files'),
    diffCheckStatus: status('diff_check'),
    traceIsolationStatus: status('trace_isolation'),
    forbiddenPatternStatus: status('service_residue') ?? status('forbidden_pattern') ?? status('suppression_scan'),
    helperThisStatus: status('helper_this_scan') ?? status('helper_this'),
    privateMethodsStatus: status('private_methods_scan') ?? status('private_scan'),
    serviceLines,
    specDiff: section('spec_diff'),
    protectedDiff: section('protected_diff'),
    traceCount: traceMatch ? Number(traceMatch[1]) : worktreeTraceCount,
    docsTraceCount: docsTraceMatch ? Number(docsTraceMatch[1]) : null,
    touchedKloelFiles,
    touchedKloelFileCount: touchedKloelFiles.length,
    fileLineCounts,
    actionHelperLines,
    runtimeHelperLines,
    runtimeContextHelperLines,
    toolRouterHelperLines,
    totalKloelLines,
    unexpectedPrivateHelperRemovalStatus,
    scopePreservationPass,
    untrackedInsertions,
    sourceInsertions,
    sourceDeletions,
    sourceChurn: sourceInsertions + sourceDeletions,
  };
}


module.exports = { validationMetrics };
