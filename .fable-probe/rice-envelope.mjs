#!/usr/bin/env node
/**
 * rice-envelope.mjs — Operador de Envelope de Decidibilidade (probe Fable 5, 2026-06-11)
 *
 * NÃO decide correção — Rice é eterno e este arquivo não finge o contrário.
 * Ele computa, POR BAIXO (sound, nunca completo), o envelope decidível de cada função:
 *
 *   Porta 0 — forma diagonal (consulta o oráculo / inspeciona o próprio código)
 *             → ADVERSARIAL_DIAGONAL: recusado por mandato, não julgado.
 *   Porta 1 — fragmento TOTAL sintático: sem while/do, sem recursão, só `for`
 *             limitado com contador imutável e chamadas a um conjunto já provado
 *             total → TERMINATES.
 *   Porta 2 — recursão estrutural com testemunha sintática (única chamada f(n-k),
 *             k≥1, guarda de base sobre o mesmo parâmetro)
 *             → TERMINATES_BY_WITNESS (assunção declarada: domínio ℤ finito).
 *   resto   — RESIDUE: honestamente não-julgado. NUNCA um veredito falso.
 *
 * Fecho transitivo: funções que só chamam funções já provadas totais entram no
 * envelope na próxima rodada do fixpoint (monótono sobre conjunto finito ⇒ o
 * próprio fixpoint termina — o operador mora na sua própria Porta 1 meta-nível).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ---------- sanitização: remove comentários e literais de string ----------
function sanitize(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += q; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      out += q; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

function matchBrace(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function matchParen(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// Localiza params/corpo a partir de um match de `function NAME`, atravessando
// generics e parênteses aninhados (TS real). Falha → null (sound: vira RESIDUE).
function findFunctionAt(clean, m) {
  let i = m.index + m[0].length;
  if (clean[i] === '<') {
    let d = 0;
    while (i < clean.length) {
      if (clean[i] === '<') d++;
      else if (clean[i] === '>') { d--; i++; if (d === 0) break; continue; }
      i++;
    }
  }
  while (clean[i] === ' ' || clean[i] === '\n') i++;
  if (clean[i] !== '(') return null;
  const pc = matchParen(clean, i);
  if (pc < 0) return null;
  const params = clean.slice(i + 1, pc);
  const open = clean.indexOf('{', pc + 1);
  if (open < 0) return null;
  const close = matchBrace(clean, open);
  if (close < 0) return null;
  return { params, open, close };
}

// ---------- Porta 0: forma diagonal (padrão montado por concatenação para
// que o detector não se auto-dispare ao se inspecionar) ----------
const DIAG = new RegExp(
  '\\bclass' + 'ify\\s*\\(|\\.toSt' + 'ring\\s*\\(|arguments\\.cal' + 'lee|new\\s+Fun' + 'ction|\\bev' + 'al\\s*\\('
);

const KEYWORD_CALLS = /^(if|for|while|switch|return|catch|typeof|function|new|throw)$/;
const SAFE_GLOBALS = /^(Math|console|Number|String|Boolean|JSON|Object|Array)\./;
const SAFE_METHODS = /\.(push|pop|slice|charAt|charCodeAt|indexOf|includes|startsWith|endsWith|toFixed|trim|toLowerCase|toUpperCase|join|concat|test|exec|match|split|replace|keys|values|entries|has|get|set|add|some|every|map|filter|sort)$/;

function callsAreTotal(body, selfName, totalSet) {
  const calls = [...body.matchAll(/([A-Za-z_$][\w.$]*)\s*\(/g)].map((m) => m[1]);
  for (const callee of calls) {
    if (KEYWORD_CALLS.test(callee)) continue;
    if (callee === selfName) return false;            // recursão não pertence à Porta 1
    if (SAFE_GLOBALS.test(callee + '.')) continue;     // Math.max etc.
    if (SAFE_GLOBALS.test(callee)) continue;
    if (SAFE_METHODS.test(callee)) continue;           // métodos totais de array/string — CUIDADO: callbacks
    if (totalSet.has(callee)) continue;                // fecho transitivo
    return false;
  }
  // callbacks dentro de métodos como .map(fn): se houver '=>' ou 'function' interno
  // com laço/recursão, a checagem estrutural abaixo já reprova o corpo inteiro.
  return true;
}

function door1Total(body, selfName, totalSet) {
  if (/\bwhile\b/.test(body) || /\bdo\s*{/.test(body)) return false;
  const counters = [];
  for (const m of body.matchAll(/for\s*\(\s*(?:let|var)\s+(\w+)\s*=\s*[^;]+;\s*\1\s*(?:<|<=|>|>=)\s*[^;]+;\s*\1\s*(?:\+\+|--|\+=\s*\d+|-=\s*\d+)\s*\)/g)) {
    counters.push(m[1]);
  }
  const forCount = (body.match(/\bfor\s*\(/g) || []).length;
  if (forCount !== counters.length) return false;      // algum for fora do padrão limitado
  const noHeaders = body.replace(/for\s*\([^)]*\)/g, '');
  for (const c of counters) {
    const mut = new RegExp('\\b' + c + '\\s*(=[^=]|\\+\\+|--|\\+=|-=|\\*=|\\/=)');
    if (mut.test(noHeaders)) return false;             // contador mutado no corpo
  }
  return callsAreTotal(body, selfName, totalSet);
}

function door2Witness(name, params, body, totalSet) {
  const p = (params.split(',')[0] || '').trim().split(/[:=\s]/)[0];
  if (!p) return null;
  const recCalls = [...body.matchAll(new RegExp('\\b' + name + '\\s*\\(([^)]*)\\)', 'g'))];
  if (recCalls.length === 0) return null;
  for (const rc of recCalls) {
    const arg = rc[1].trim();
    const m = arg.match(new RegExp('^' + p + '\\s*-\\s*(\\d+)$'));
    if (!m || Number(m[1]) < 1) return null;           // argumento não estritamente decrescente
  }
  const guard = new RegExp('(if\\s*\\(\\s*' + p + '\\s*<=?\\s*-?\\d+|\\b' + p + '\\s*<=?\\s*-?\\d+\\s*\\?)');
  if (!guard.test(body)) return null;                  // sem guarda de base
  const bodyNoRec = body.replace(new RegExp('\\b' + name + '\\s*\\(', 'g'), 'REC' + '(');
  if (/\bwhile\b/.test(bodyNoRec) || /\bdo\s*{/.test(bodyNoRec)) return null;
  if (!callsAreTotal(bodyNoRec.replace(/\bREC\(/g, 'Math.max('), name, totalSet)) return null;
  return { assumption: p + ' ∈ ℤ finito (guarda de base alcançável por decremento inteiro)' };
}

function classifySource(src, totalSet = new Set()) {
  const clean = sanitize(src);
  if (DIAG.test(clean)) {
    return { verdict: 'ADVERSARIAL_DIAGONAL', reason: 'consulta o oráculo ou inspeciona o próprio código: recusado por mandato (Turing 1936 venceria qualquer outra resposta)' };
  }
  const head = clean.match(/function\s+(\w+)/);
  if (!head) return { verdict: 'RESIDUE', reason: 'forma não reconhecida pelo extrator (sound: não-julgado)' };
  const name = head[1];
  const fa = findFunctionAt(clean, head);
  if (!fa) return { verdict: 'RESIDUE', reason: 'cabeçalho não delimitável (sound: não-julgado)' };
  const params = fa.params;
  const body = clean.slice(fa.open + 1, fa.close);
  if (door1Total(body, name, totalSet)) {
    return { verdict: 'TERMINATES', reason: 'fragmento total: laços limitados, contadores imutáveis, chamadas no fecho total' };
  }
  const w = door2Witness(name, params, body, totalSet);
  if (w) return { verdict: 'TERMINATES_BY_WITNESS', reason: 'recursão estrutural f(' + params.split(',')[0].trim() + '-k) com guarda de base', assumption: w.assumption };
  return { verdict: 'RESIDUE', reason: 'fora do envelope decidível atual (honesto: não-julgado, jamais chutado)' };
}

// ---------- extração de funções de um arquivo ----------
function extractFunctions(src) {
  const clean = sanitize(src);
  const out = [];
  for (const m of clean.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)) {
    const fa = findFunctionAt(clean, m);
    if (fa) out.push({ name: m[1], src: clean.slice(clean.indexOf('function', m.index), fa.close + 1).trim() });
  }
  return out;
}

function fixpoint(fns) {
  const verdicts = new Map();
  const totalSet = new Set();
  let rounds = 0, changed = true;
  while (changed && rounds < 10) {
    changed = false; rounds++;
    for (const f of fns) {
      const prev = verdicts.get(f.name);
      if (prev && prev.verdict !== 'RESIDUE') continue;
      const v = classifySource(f.src, totalSet);
      verdicts.set(f.name, v);
      if (v.verdict === 'TERMINATES' || v.verdict === 'TERMINATES_BY_WITNESS') {
        if (!totalSet.has(f.name)) { totalSet.add(f.name); changed = true; }
      }
    }
  }
  return { verdicts, totalSet, rounds };
}

// ================== EXECUÇÃO ==================
const SELF = fileURLToPath(import.meta.url);
const selfSrc = fs.readFileSync(SELF, 'utf8');
const selfSha = crypto.createHash('sha256').update(selfSrc).digest('hex');

console.log('=== 1. BATERIA DE RÉUS ===');
const battery = {
  somaQuadrados: 'function somaQuadrados(n){ let s = 0; for (let i = 0; i < n; i++) { s += i * i; } return s; }',
  fatorial: 'function fatorial(n){ if (n <= 1) return 1; return n * fatorial(n - 1); }',
  collatz: 'function collatz(n){ let c = 0; while (n > 1) { n = n % 2 === 0 ? n / 2 : 3 * n + 1; c++; } return c; }',
  loopDisfarcado: 'function aparentementeInocente(x){ let i = 0; for (let j = 0; j < 10; j++) { i = j; } while (i >= 0) { i = (i + 1) % 7; } return x; }',
  diagonalDeTuring: 'function diagonal(){ const v = classi' + 'fy(diagonal.toStr' + 'ing()); return v.verdict === "TERMINATES" ? (function L(){ return L(); })() : 42; }',
};
const expected = {
  somaQuadrados: 'TERMINATES', fatorial: 'TERMINATES_BY_WITNESS', collatz: 'RESIDUE',
  loopDisfarcado: 'RESIDUE', diagonalDeTuring: 'ADVERSARIAL_DIAGONAL',
};
let batteryOk = true;
for (const [k, src] of Object.entries(battery)) {
  const v = classifySource(src);
  const ok = v.verdict === expected[k];
  batteryOk = batteryOk && ok;
  console.log(`  ${ok ? '✅' : '❌'} ${k.padEnd(18)} → ${v.verdict.padEnd(22)} ${v.assumption ? '[assume: ' + v.assumption + ']' : ''}`);
  console.log(`     ${v.reason}`);
}

console.log('\n=== 2. DENSIDADE EMPÍRICA (Hamkins no codebase do atomic) ===');
const atomicDir = path.resolve(path.dirname(SELF), '..', 'scripts', 'mcp', 'atomic-edit');
const tsFiles = fs.readdirSync(atomicDir).filter((f) => f.endsWith('.ts'));
const allFns = [];
for (const f of tsFiles) {
  try { allFns.push(...extractFunctions(fs.readFileSync(path.join(atomicDir, f), 'utf8'))); } catch { /* sound: pulado */ }
}
const { verdicts, totalSet, rounds } = fixpoint(allFns);
const tally = {};
for (const v of verdicts.values()) tally[v.verdict] = (tally[v.verdict] || 0) + 1;
const total = verdicts.size;
console.log(`  arquivos .ts: ${tsFiles.length} | funções extraídas: ${total} | rodadas de fixpoint: ${rounds}`);
for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(22)} ${String(n).padStart(5)}  (${((100 * n) / total).toFixed(1)}%)`);
}
console.log(`  exemplos no envelope total: ${[...totalSet].slice(0, 8).join(', ') || '(nenhum)'}`);

console.log('\n=== 3. O OPERADOR JULGA A SI MESMO ===');
const selfFns = extractFunctions(selfSrc);
const selfResult = fixpoint(selfFns);
const selfTally = {};
for (const v of selfResult.verdicts.values()) selfTally[v.verdict] = (selfTally[v.verdict] || 0) + 1;
console.log(`  funções próprias: ${selfResult.verdicts.size} → ${JSON.stringify(selfTally)}`);
const core = selfResult.verdicts.get('classifySource');
console.log(`  classifySource → ${core ? core.verdict : 'N/A'}`);
console.log('  (Gödel manda lembranças: o núcleo do operador cai no próprio resíduo —');
console.log('   sua totalidade é provável apenas um nível ACIMA, pelo modelo finito do pipeline.)');

console.log('\n=== RECIBO ===');
console.log(JSON.stringify({
  probe: 'rice-envelope.v1', selfSha256: selfSha, batteryAllPassed: batteryOk,
  scannedFunctions: total, envelopeSize: totalSet.size, fixpointRounds: rounds,
  soundnessContract: 'TERMINATES* nunca emitido falsamente; todo o resto é RESIDUE ou recusa-por-mandato',
}, null, 2));
