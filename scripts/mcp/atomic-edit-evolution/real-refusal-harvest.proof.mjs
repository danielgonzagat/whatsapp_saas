#!/usr/bin/env node
/**
 * real-refusal-harvest.proof.mjs — prova executável do colhedor de recusas
 * reais. Cada check é recomputável; falha => exit 1. O juiz da cadeia é
 * SEMPRE o kernel (verifyCorpusJsonl), nunca o próprio colhedor.
 */
import * as crypto from 'node:crypto';
import {
  harvest,
  mapExecRefusal,
  mapBypassEvent,
  classifyExecRefusal,
  commandShape,
  commandHead,
  runCli,
} from './real-refusal-harvester.mjs';
import { verifyCorpusJsonl, selectDisproofs, buildBriefing, selectHeldOut } from './disproof-corpus-harness.mjs';
import { consolidate } from './lesson-harness.mjs';

const sha256Text = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
const ARCHIVE = sha256Text('proof-archive-entry');
const checks = [];
function check(label, cond) {
  checks.push({ label, ok: cond === true });
  if (cond !== true) console.error(`FALHOU: ${label}`);
}

// ── fixtures: linhas REAIS do exec-ledger (forma exata observada em produção) ──
const HOUR = 3600000;
const execLine = (ts, command, reason, commandClass) =>
  JSON.stringify({ ts, kind: 'refused', reason, commandClass, command, cwd: '/Users/x/repo' });
const REASON_PROVE = 'mutable-or-unknown command requires proveEffect:true (or rollbackOnNonZero:true) under Y admission; unproven shell effects are not byte-correct-by-construction.';
const REASON_GOV = 'refused: shell write to governance-protected file scripts/mcp/atomic-edit/server.ts';
const REASON_EXT = 'external-or-host-effect commands are refused because filesystem proof cannot approve external state.';

// 1) forma do comando: sufixos numéricos/hex caem na MESMA parede
check('shape: dígitos→N unifica smoke triplo', commandShape("node -e 'w(\".s.70273.txt\")'") === commandShape("node -e 'w(\".s.78452.txt\")'"));
check('shape: hex>=8→H', commandShape('git checkout abcdef0123456789') === commandShape('git checkout 9876543210fedcba'));
check('shape: payloads distintos = paredes distintas', commandShape('node -e "a()"') !== commandShape('node -e "b()"'));
check('head: caminho vira basename', commandHead('/usr/bin/node x.mjs') === 'node');

// 2) classificação de família é decidível e estável
check('família proveEffect', classifyExecRefusal({ reason: REASON_PROVE, commandClass: 'mutable-or-unknown' }) === 'effect-proof-required');
check('família governança', classifyExecRefusal({ reason: REASON_GOV, commandClass: 'mutable-or-unknown' }) === 'governance-file-write');
check('família externa', classifyExecRefusal({ reason: REASON_EXT, commandClass: 'external-or-host-effect' }) === 'external-or-host-effect');

// 3) mapeadores fail-closed
check('mapExec recusa não-refused', mapExecRefusal({ ts: 1, kind: 'ok', command: 'ls', reason: 'x' }, { archiveEntrySha256: ARCHIVE }) === null);
check('mapBypass recusa não-estrito', mapBypassEvent({ ts: 1, tool: 'Bash', category: 'c', blockedByDenyHook: true, strictAtomicOnly: false, target: 't' }, { archiveEntrySha256: ARCHIVE }) === null);
const bypassMapped = mapBypassEvent({ ts: 1, tool: 'Bash', category: 'bash-exec', atomicEquivalent: 'atomic_exec', blockedByDenyHook: true, strictAtomicOnly: true, target: 'sed' }, { archiveEntrySha256: ARCHIVE });
check('mapBypass carrega repairHint com equivalente atômico', bypassMapped?.repairHint?.includes('atomic_exec') === true);

// 4) colheita ponta-a-ponta sobre fixture com eixo temporal real
const execFixture = [
  execLine(1 * HOUR, "node -e 'w(\".a.111.txt\")'", REASON_PROVE, 'mutable-or-unknown'),
  execLine(2 * HOUR, "node -e 'w(\".a.222.txt\")'", REASON_PROVE, 'mutable-or-unknown'),  // mesma forma → HIT
  execLine(3 * HOUR, "node -e 'x(\"payload-b\")'", REASON_PROVE, 'mutable-or-unknown'),   // forma nova → witness
  execLine(4 * HOUR, "node -e 'y(\"payload-c\")'", REASON_PROVE, 'mutable-or-unknown'),
  execLine(5 * HOUR, "node -e 'z(\"payload-d\")'", REASON_PROVE, 'mutable-or-unknown'),
  execLine(6 * HOUR, "node -e 'q(\"payload-e\")'", REASON_PROVE, 'mutable-or-unknown'),
  execLine(6 * HOUR + 1, 'curl https://api.example.com', REASON_EXT, 'external-or-host-effect'),
  'linha-invalida-nao-json',
].join('\n');
const bypassFixture = [
  JSON.stringify({ ts: 1 * HOUR + 5, tool: 'Bash', category: 'bash-exec', atomicEquivalent: 'atomic_exec', blockedByDenyHook: true, strictAtomicOnly: true, target: 'sed' }),
  JSON.stringify({ ts: 2 * HOUR + 5, tool: 'Bash', category: 'bash-exec', atomicEquivalent: 'atomic_exec', blockedByDenyHook: true, strictAtomicOnly: false, target: 'awk' }),
].join('\n');
const harvested = harvest({ execLedgerText: execFixture, bypassLedgerText: bypassFixture, archiveEntrySha256: ARCHIVE });
check('harvest ok', harvested.ok === true);
check('linha inválida contada, não engolida', harvested.stats.exec.invalidJson === 1);
check('não-estrito excluído e contado', harvested.stats.denyLedger.skippedNonStrict === 1);
check('dedup semântico vivo: 1 hit do smoke-par', harvested.stats.hits === 1);
check('witnesses = formas distintas (5 node + 1 curl + 1 sed)', harvested.stats.witnesses === 7);
check('reconciliação total: eventos = witnesses + hits', harvested.stats.events === harvested.stats.witnesses + harvested.stats.hits);
check('gerações = baldes de hora distintos', harvested.stats.generations === 6);

// 5) o juiz é o kernel: cadeia verifica; adulteração REPROVA
const kernelVerdict = verifyCorpusJsonl(harvested.corpusText);
check('kernel verifica corpus colhido (réplica de HIT sem drift)', kernelVerdict.ok === true && kernelVerdict.recordCount === 8);
const tampered = harvested.corpusText.replace('"generation":1', '"generation":7');
check('1-byte de adulteração → REPROVADO', verifyCorpusJsonl(tampered).ok !== true);

// 6) determinismo byte-exato
const again = harvest({ execLedgerText: execFixture, bypassLedgerText: bypassFixture, archiveEntrySha256: ARCHIVE });
check('determinismo: mesma entrada → mesmo corpus byte-exato', sha256Text(again.corpusText) === sha256Text(harvested.corpusText));

// 7) III.d roda sobre o corpus colhido: cluster exec/node elegível, lei validada por previsão temporal
const lessons = consolidate({ corpusText: harvested.corpusText });
check('consolidate ok sobre corpus real-shape', lessons.ok === true);
const acceptedNode = lessons.accepted.find((lesson) => lesson.clusterKey === 'atomic-exec.refusal.effect-proof-required::exec/node');
check('lei aceita para exec/node (>=3 witnesses, treino explica, futuro previsto)', Boolean(acceptedNode));
check('lei carrega neverAGate:true (teto III.d.5)', acceptedNode?.neverAGate === true);
check('lei validada por previsão (testPredicted >= 2)', Number(String(acceptedNode?.validation?.testPredicted ?? '0/0').split('/')[0]) >= 2);
check('clusters pequenos descartados COM razão', lessons.discarded.every((d) => typeof d.reason === 'string' && d.reason.length > 0));

// 8) held-out materializável + briefing exclui held-out (anti-vazamento C4d)
const heldOut = selectHeldOut({ invariantIds: harvested.invariantIds });
check('held-out determinístico sobre invariantIds reais', heldOut.ok === true && heldOut.heldOut.length >= 1);
const sel = selectDisproofs({ corpusText: harvested.corpusText, region: 'exec/node', k: 6 });
check('selectDisproofs ok', sel.ok === true && sel.selected.length > 0);
const taughtOnly = sel.selected.filter((wall) => !heldOut.heldOut.includes(wall.invariantId));
const taughtLessons = lessons.accepted.filter((lesson) => !heldOut.heldOut.includes(lesson.invariantId));
const briefing = buildBriefing({ selected: taughtOnly, lessons: taughtLessons });
check('briefing gerado com digest', briefing.ok === true && /^[0-9a-f]{64}$/.test(briefing.briefingDigest));
check('briefing não cita NENHUM invariant held-out', heldOut.heldOut.every((id) => !briefing.text.includes(id)));

// 9) contrato CLI: stdin JSON, nunca JSONL cru; self-test verde
const cliHelp = runCli(['--help'], '');
check('CLI declara contrato stdin JSON', cliHelp.ok === true && cliHelp.stdin.includes('NUNCA JSONL cru'));
const cliSelf = runCli(['--self-test'], '');
check('CLI --self-test verde (inclui forja rejeitada)', cliSelf.ok === true && cliSelf.forgedRejected === true);
const cliHarvest = runCli(['--harvest'], JSON.stringify({ execLedgerText: execFixture, bypassLedgerText: bypassFixture, archiveEntrySha256: ARCHIVE }));
check('CLI --harvest == API', cliHarvest.ok === true && sha256Text(cliHarvest.corpusText) === sha256Text(harvested.corpusText));
check('harvest sem archiveEntrySha256 → recusa fail-closed', harvest({ execLedgerText: execFixture }).ok === false);

const failed = checks.filter((c) => !c.ok);
const summary = { ok: failed.length === 0, total: checks.length, passed: checks.length - failed.length, failed: failed.map((c) => c.label) };
console.log(JSON.stringify(summary, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
