#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolSource = fs.readFileSync(path.join(sourceDir, 'server-tools-disproof.ts'), 'utf8');
const selfSource = fs.readFileSync(path.join(sourceDir, 'server-tools-self.ts'), 'utf8');
const latticeSource = fs.readFileSync(path.join(sourceDir, 'gates/self-expansion-validator-lattice.proof.mjs'), 'utf8');
const lessonHarnessPath = path.join(sourceDir, '..', 'atomic-edit-evolution', 'lesson-harness.mjs');
const lessonProofPath = path.join(sourceDir, '..', 'atomic-edit-evolution', 'lesson.proof.mjs');

function record(results, name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

function main() {
  const results = [];
  const lessonToolIndex = toolSource.indexOf("server.registerTool(\n    'atomic_lesson_rules'");
  const nextToolIndex = toolSource.indexOf("server.registerTool(\n    'atomic_disproof_briefing'", lessonToolIndex);
  const lessonToolBody = lessonToolIndex >= 0
    ? toolSource.slice(lessonToolIndex, nextToolIndex > lessonToolIndex ? nextToolIndex : toolSource.length)
    : '';
  const buildBriefingIndex = selfSource.indexOf('function buildSelfEvolutionNextDisproofBriefing');
  const nextFunctionIndex = selfSource.indexOf('\nfunction promotionReceiptRejectionCodes', buildBriefingIndex);
  const buildBriefingBody = buildBriefingIndex >= 0
    ? selfSource.slice(buildBriefingIndex, nextFunctionIndex > buildBriefingIndex ? nextFunctionIndex : selfSource.length)
    : '';
  const lessonProof = childProcess.spawnSync(process.execPath, [lessonProofPath], {
    cwd: path.join(sourceDir, '..', 'atomic-edit-evolution'),
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 10 * 1024 * 1024,
  });

  record(
    results,
    'atomic_lesson_rules is registered and delegates to lesson-harness modes',
    toolSource.includes("'atomic_lesson_rules'") &&
      toolSource.includes('function runLessonRules') &&
      toolSource.includes("'verify-lessons': '--verify-lessons-jsonl'") &&
      toolSource.includes("'cluster-witnesses': '--cluster-witnesses'") &&
      toolSource.includes("consolidate: '--consolidate'") &&
      fs.existsSync(lessonHarnessPath),
    { lessonHarnessPath },
  );
  record(
    results,
    'lesson persistence is hardwired, explicit, previewable, and byte-verified',
    toolSource.includes("path.join(REPO_ROOT, '.atomic', 'lesson-rules.jsonl')") &&
      toolSource.includes('lesson rules persistence is hardwired to .atomic/lesson-rules.jsonl') &&
      toolSource.includes('persist && !preview && changed') &&
      toolSource.includes('fs.openSync(tmpPath') &&
      toolSource.includes('fs.renameSync(tmpPath, canonicalPath)') &&
      toolSource.includes('lesson rules post-write byte verification failed') &&
      !toolSource.includes('fs.writeFileSync') &&
      !toolSource.includes('fs.appendFileSync') &&
      !lessonToolBody.includes('path: z.') &&
      !lessonToolBody.includes('targetPath') &&
      !lessonToolBody.includes('outputPath'),
    {},
  );
  record(
    results,
    'briefing and shadow consume validated LessonRules but remain guidance-only',
    toolSource.includes('function loadValidatedLessonRules') &&
      toolSource.includes("runLessonHarness('verify-lessons'") &&
      toolSource.includes('lessons: lessonRules.lessons') &&
      toolSource.includes('lessonCount: lessonRules.lessons.length') &&
      toolSource.includes('LessonRules are proposer guidance, not gates and not proof of correctness.') &&
      toolSource.includes('correctedDiff: null'),
    {},
  );
  record(
    results,
    'atomic_expand_self preflight consumes validated lessons instead of empty lessons',
    selfSource.includes("const SELF_EVOLUTION_LESSON_RULES_REL = path.join('.atomic', 'lesson-rules.jsonl')") &&
      selfSource.includes("const LESSON_RULE_HARNESS_REL = path.join('scripts/mcp/atomic-edit-evolution', 'lesson-harness.mjs')") &&
      selfSource.includes('function readSelfEvolutionLessonRules') &&
      buildBriefingBody.includes('const lessonRules = readSelfEvolutionLessonRules();') &&
      buildBriefingBody.includes('lessons: lessonRules.lessons') &&
      !buildBriefingBody.includes('lessons: []') &&
      buildBriefingBody.includes('LessonRules are validated guidance and never become gates.'),
    {},
  );
  record(
    results,
    'self-expansion lattice permanently runs the LessonRules proof',
    selfSource.includes("phase: 'self-evolution-lessons'") &&
      selfSource.includes('node gates/self-evolution-lesson-rules.proof.mjs --json') &&
      latticeSource.includes('node gates/self-evolution-lesson-rules.proof.mjs --json') &&
      latticeSource.includes("'self-evolution-lessons'"),
    {},
  );
  record(
    results,
    'the underlying lesson harness behavioral proof is green',
    lessonProof.status === 0,
    {
      status: lessonProof.status,
      stderr: String(lessonProof.stderr ?? '').slice(0, 1000),
      stdout: String(lessonProof.stdout ?? '').slice(0, 1000),
    },
  );

  const ok = results.every((result) => result.ok);
  const payload = { ok, results };
  if (jsonMode) console.log(JSON.stringify(payload, null, 2));
  else console.log(ok ? 'self-evolution-lesson-rules proof OK' : 'self-evolution-lesson-rules proof FAILED');
  process.exit(ok ? 0 : 1);
}

main();
