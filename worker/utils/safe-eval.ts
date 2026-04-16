/**
 * Avaliador Seguro de Expressoes
 *
 * Usa mathjs como motor de avaliacao — sandbox nativo, sem acesso ao escopo
 * global, sem prototipo, sem chamadas de funcao arbitrarias.
 *
 * SEGURANCA:
 * - mathjs roda em sandbox proprio (sem acesso a global/process/require)
 * - Nao permite acesso a prototipos
 * - Nao permite chamadas de funcao arbitrarias (apenas as importadas)
 * - Timeout implicito (expressoes sao sincronas e limitadas)
 *
 * Substitui expr-eval (CVE de prototype-pollution e execucao irrestrita).
 */

import { all, create } from 'mathjs';

const PROTO_RE = /__proto__/gi;
const PROTOTYPE_RE = /prototype/gi;
const CONSTRUCTOR_RE = /constructor/gi;
const BEVAL_B_RE = /\beval\b/gi;
const B_FUNCTION_B_RE = /\bFunction\b/gi;
const BPROCESS_B_RE = /\bprocess\b/gi;
const BREQUIRE_B_RE = /\brequire\b/gi;
const BIMPORT_B_RE = /\bimport\b/gi;
const BGLOBAL_B_RE = /\bglobal\b/gi;
const BWINDOW_B_RE = /\bwindow\b/gi;
const BDOCUMENT_B_RE = /\bdocument\b/gi;
const PATTERN_RE = /===/g;
const PATTERN_RE_2 = /!==/g;
const PATTERN_RE_3 = /&&/g;
const PATTERN_RE_4 = /\|\|/g;
const PATTERN_RE_5 = /!(?!=)/g;

// Cria instancia isolada do mathjs com todas funcoes built-in
const math = create(all);

// Registrar funcoes customizadas que o flow-engine usa
// (string helpers, type checks, array helpers)
math.import(
  {
    // -- Funcoes de string --------------------------------------------------
    toLowerCase: (s: unknown) => String(s).toLowerCase(),
    toUpperCase: (s: unknown) => String(s).toUpperCase(),
    trim: (s: unknown) => String(s).trim(),
    length: (s: unknown) => String(s).length,
    includes: (s: unknown, search: unknown) => String(s).includes(String(search)),
    startsWith: (s: unknown, search: unknown) => String(s).startsWith(String(search)),
    endsWith: (s: unknown, search: unknown) => String(s).endsWith(String(search)),
    substring: (s: unknown, start: number, end?: number) => String(s).substring(start, end),

    // -- Funcoes de tipo ----------------------------------------------------
    isNumber: (v: unknown) => typeof v === 'number' && !isNaN(v as number),
    isString: (v: unknown) => typeof v === 'string',
    isEmpty: (v: unknown) =>
      v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0),
    toNumber: (v: unknown) => Number(v) || 0,
    // mathjs already exports `string()` — register as `toString` to keep compat
    toString: (v: unknown) => String(v ?? ''),

    // -- Funcoes de array ---------------------------------------------------
    arrayLength: (arr: unknown) => (Array.isArray(arr) ? arr.length : 0),
    arrayIncludes: (arr: unknown, item: unknown) => Array.isArray(arr) && arr.includes(item),
  },
  { override: true },
);

/**
 * Avalia uma expressao de forma segura
 *
 * @param expression - Expressao a ser avaliada (ex: "idade > 18", "nome == 'Joao'")
 * @param variables  - Objeto com variaveis disponiveis para a expressao
 * @returns Resultado da expressao ou false em caso de erro
 *
 * @example
 * safeEvaluate("idade >= 18 and nome != ''", { idade: 25, nome: "Joao" }) // true
 * safeEvaluate("preco * quantidade", { preco: 10, quantidade: 5 })        // 50
 */
export function safeEvaluate(expression: string, variables: Record<string, unknown>): unknown {
  try {
    // Sanitizacao basica da expressao
    const sanitized = sanitizeExpression(expression);

    // Sanitizacao das variaveis (remove funcoes e prototipos perigosos)
    const safeVars = sanitizeVariables(variables);

    // Avalia usando mathjs (sandbox nativo)
    return math.evaluate(sanitized, safeVars);
  } catch (error) {
    console.warn('[SAFE-EVAL] Erro ao avaliar expressao:', expression, error);
    return false;
  }
}

/**
 * Avalia uma expressao e retorna boolean
 */
export function safeEvaluateBoolean(
  expression: string,
  variables: Record<string, unknown>,
): boolean {
  const result = safeEvaluate(expression, variables);
  return Boolean(result);
}

/**
 * Sanitiza a expressao removendo padroes perigosos.
 *
 * mathjs ja e sandboxed, mas mantemos a camada de defesa em profundidade
 * para bloquear tokens que nunca deveriam aparecer numa expressao de fluxo.
 */
function sanitizeExpression(expr: string): string {
  // Remove tentativas de acesso a prototipos / escopo global
  let sanitized = expr
    .replace(PROTO_RE, '')
    .replace(PROTOTYPE_RE, '')
    .replace(CONSTRUCTOR_RE, '')
    .replace(BEVAL_B_RE, '')
    .replace(B_FUNCTION_B_RE, '')
    .replace(BPROCESS_B_RE, '')
    .replace(BREQUIRE_B_RE, '')
    .replace(BIMPORT_B_RE, '')
    .replace(BGLOBAL_B_RE, '')
    .replace(BWINDOW_B_RE, '')
    .replace(BDOCUMENT_B_RE, '');

  // Converte operadores JavaScript para sintaxe mathjs
  sanitized = sanitized.replace(PATTERN_RE, '==').replace(PATTERN_RE_2, '!=');

  // mathjs usa `and`, `or`, `not` nativamente — converter && e || tambem
  sanitized = sanitized.replace(PATTERN_RE_3, ' and ').replace(PATTERN_RE_4, ' or ');

  // Converte `!expr` para `not expr` (cuidado para nao converter `!=`)
  // Apenas `!` que NAO e seguido por `=`
  sanitized = sanitized.replace(PATTERN_RE_5, ' not ');

  return sanitized.trim();
}

/**
 * Sanitiza variaveis removendo funcoes e propriedades perigosas
 */
function sanitizeVariables(vars: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(vars)) {
    // Ignora chaves perigosas
    if (['__proto__', 'prototype', 'constructor'].includes(key)) {
      continue;
    }

    // Ignora funcoes
    if (typeof value === 'function') {
      continue;
    }

    // Para objetos, faz sanitizacao recursiva (apenas 1 nivel para performance)
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      safe[key] = {};
      for (const [k, v] of Object.entries(value)) {
        if (typeof v !== 'function' && !['__proto__', 'prototype', 'constructor'].includes(k)) {
          safe[key][k] = v;
        }
      }
    } else {
      safe[key] = value;
    }
  }

  return safe;
}

/**
 * Valida se uma expressao e segura antes de avaliar.
 * Util para validacao no frontend antes de salvar.
 */
export function validateExpression(expression: string): { valid: boolean; error?: string } {
  try {
    const sanitized = sanitizeExpression(expression);
    // mathjs.parse() valida a sintaxe sem executar
    math.parse(sanitized);
    return { valid: true };
  } catch (error: unknown) {
    const errorInstanceofError =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'unknown error');
    return { valid: false, error: errorInstanceofError.message };
  }
}
