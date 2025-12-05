/**
 * Avaliador Seguro de Expressões
 * 
 * Substitui o uso de `new Function()` que permite injeção de código.
 * Usa expr-eval que permite apenas operações matemáticas e lógicas seguras.
 * 
 * SEGURANÇA:
 * - Não permite acesso ao escopo global
 * - Não permite chamadas de função arbitrárias
 * - Não permite acesso a protótipos
 * - Timeout implícito (expressões são síncronas e limitadas)
 */

import { Parser } from 'expr-eval';

// Parser configurado com segurança
const parser = new Parser({
  allowMemberAccess: true, // Permite acessar propriedades de objetos
});

// Adicionar funções seguras permitidas
parser.functions = {
  // Funções de string
  toLowerCase: (s: string) => String(s).toLowerCase(),
  toUpperCase: (s: string) => String(s).toUpperCase(),
  trim: (s: string) => String(s).trim(),
  length: (s: string) => String(s).length,
  includes: (s: string, search: string) => String(s).includes(search),
  startsWith: (s: string, search: string) => String(s).startsWith(search),
  endsWith: (s: string, search: string) => String(s).endsWith(search),
  substring: (s: string, start: number, end?: number) => String(s).substring(start, end),
  
  // Funções numéricas
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  min: Math.min,
  max: Math.max,
  
  // Funções de tipo
  isNumber: (v: any) => typeof v === 'number' && !isNaN(v),
  isString: (v: any) => typeof v === 'string',
  isEmpty: (v: any) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0),
  toNumber: (v: any) => Number(v) || 0,
  toString: (v: any) => String(v ?? ''),
  
  // Funções de array
  arrayLength: (arr: any[]) => Array.isArray(arr) ? arr.length : 0,
  arrayIncludes: (arr: any[], item: any) => Array.isArray(arr) && arr.includes(item),
};

/**
 * Avalia uma expressão de forma segura
 * 
 * @param expression - Expressão a ser avaliada (ex: "idade > 18", "nome == 'João'")
 * @param variables - Objeto com variáveis disponíveis para a expressão
 * @returns Resultado da expressão ou false em caso de erro
 * 
 * @example
 * safeEvaluate("idade >= 18 and nome != ''", { idade: 25, nome: "João" }) // true
 * safeEvaluate("preco * quantidade", { preco: 10, quantidade: 5 }) // 50
 */
export function safeEvaluate(expression: string, variables: Record<string, any>): any {
  try {
    // Sanitização básica da expressão
    const sanitized = sanitizeExpression(expression);
    
    // Sanitização das variáveis (remove funções e protótipos perigosos)
    const safeVars = sanitizeVariables(variables);
    
    // Parse e avaliação
    const parsed = parser.parse(sanitized);
    return parsed.evaluate(safeVars);
  } catch (error) {
    console.warn('[SAFE-EVAL] Erro ao avaliar expressão:', expression, error);
    return false;
  }
}

/**
 * Avalia uma expressão e retorna boolean
 */
export function safeEvaluateBoolean(expression: string, variables: Record<string, any>): boolean {
  const result = safeEvaluate(expression, variables);
  return Boolean(result);
}

/**
 * Sanitiza a expressão removendo padrões perigosos
 */
function sanitizeExpression(expr: string): string {
  // Remove tentativas de acesso a protótipos
  let sanitized = expr
    .replace(/__proto__/gi, '')
    .replace(/prototype/gi, '')
    .replace(/constructor/gi, '')
    .replace(/\beval\b/gi, '')
    .replace(/\bFunction\b/gi, '')
    .replace(/\bprocess\b/gi, '')
    .replace(/\brequire\b/gi, '')
    .replace(/\bimport\b/gi, '')
    .replace(/\bglobal\b/gi, '')
    .replace(/\bwindow\b/gi, '')
    .replace(/\bdocument\b/gi, '');
  
  // Converte operadores JavaScript para expr-eval
  sanitized = sanitized
    .replace(/===/g, '==')
    .replace(/!==/g, '!=')
    .replace(/&&/g, ' and ')
    .replace(/\|\|/g, ' or ')
    .replace(/!/g, ' not ');
  
  return sanitized.trim();
}

/**
 * Sanitiza variáveis removendo funções e propriedades perigosas
 */
function sanitizeVariables(vars: Record<string, any>): Record<string, any> {
  const safe: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(vars)) {
    // Ignora chaves perigosas
    if (['__proto__', 'prototype', 'constructor'].includes(key)) {
      continue;
    }
    
    // Ignora funções
    if (typeof value === 'function') {
      continue;
    }
    
    // Para objetos, faz sanitização recursiva (apenas 1 nível para performance)
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
 * Valida se uma expressão é segura antes de avaliar
 * Útil para validação no frontend antes de salvar
 */
export function validateExpression(expression: string): { valid: boolean; error?: string } {
  try {
    const sanitized = sanitizeExpression(expression);
    parser.parse(sanitized);
    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}
