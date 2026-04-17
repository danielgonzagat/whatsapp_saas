import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const RX_1_50_RE = /(.)\1{50,}/g;

/**
 * Middleware para sanitizar inputs de texto que vão para a IA.
 * Remove tentativas comuns de prompt injection e jailbreak.
 * PULSE:OK — no pagination parameters; this is a text sanitizer, not a data endpoint
 */
@Injectable()
export class PromptSanitizerMiddleware implements NestMiddleware {
  private readonly logger = new Logger(PromptSanitizerMiddleware.name);

  // Padrões de prompt injection / jailbreak
  private readonly dangerousPatterns = [
    // Instruções para ignorar sistema
    /ignore\s+(all\s+)?(previous|prior|above|system)\s+(instructions?|prompts?|rules?)/gi,
    /disregard\s+(all\s+)?(previous|prior|above|system)/gi,
    /forget\s+(everything|all|your)\s+(instructions?|training|rules?)/gi,

    // Bypass de segurança
    /bypass\s+(security|filter|restriction|moderation)/gi,
    /disable\s+(safety|filter|restriction|moderation)/gi,

    // Role-play malicioso
    /pretend\s+you\s+are\s+(not\s+)?(an?\s+)?ai/gi,
    /you\s+are\s+now\s+(DAN|jailbroken|unrestricted)/gi,
    /act\s+as\s+if\s+you\s+have\s+no\s+(rules?|restrictions?|limits?)/gi,

    // Comandos de sistema
    /\[system\]/gi,
    /\[INST\]/gi,
    /<<SYS>>/gi,
    /<\|im_start\|>/gi,

    // Injeção de código
    /execute\s+(this\s+)?(code|script|command)/gi,
    /run\s+(this\s+)?(code|script|command)/gi,

    // Extração de prompt
    /reveal\s+(your\s+)?(system\s+)?(prompt|instructions?)/gi,
    /show\s+(me\s+)?(your\s+)?(system\s+)?(prompt|instructions?)/gi,
    /what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions?)/gi,

    // Português - instruções para ignorar
    /ignore\s+(as\s+)?instru[çc][õo]es/gi,
    /esque[çc]a\s+(todas?\s+)?(as\s+)?instru[çc][õo]es/gi,
    /desconsidere\s+(todas?\s+)?(as\s+)?regras?/gi,
  ];

  use(req: Request, _res: Response, next: NextFunction) {
    if (req.body) {
      this.sanitizeObject(req.body, req.path);
    }
    next();
  }

  /** Property names that must never be accessed via bracket notation. */
  private static readonly BLOCKED_PROPS = new Set(['__proto__', 'constructor', 'prototype']);

  private sanitizeObject(obj: Record<string, unknown>, path: string): void {
    if (!obj || typeof obj !== 'object') return;

    // Object.keys() returns own enumerable properties only — safe from prototype chain.
    // The BLOCKED_PROPS guard adds defense-in-depth against prototype pollution.
    for (const key of Object.keys(obj)) {
      if (PromptSanitizerMiddleware.BLOCKED_PROPS.has(key)) continue;
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;

      const value = obj[key];

      if (typeof value === 'string') {
        const sanitized = this.sanitizeString(value);
        if (sanitized !== value) {
          this.logger.warn(`Prompt injection detectado em ${path}.${key}`);
          obj[key] = sanitized;
        }
      } else if (value && typeof value === 'object') {
        this.sanitizeObject(value as Record<string, unknown>, `${path}.${key}`);
      }
    }
  }

  /** @internal exposed for sanitizePromptInput utility */
  sanitizeString(input: string): string {
    let result = input;

    for (const pattern of this.dangerousPatterns) {
      result = result.replace(pattern, '[removed]');
    }

    result = stripAlwaysRespondDirective(result);

    // Remove caracteres de controle Unicode (exceto newlines e tabs)
    result = Array.from(result)
      .filter((char) => {
        const codePoint = char.codePointAt(0) ?? 0;
        const isForbiddenLatinControl =
          (codePoint >= 0x00 && codePoint <= 0x08) ||
          codePoint === 0x0b ||
          codePoint === 0x0c ||
          (codePoint >= 0x0e && codePoint <= 0x1f) ||
          (codePoint >= 0x7f && codePoint <= 0x9f);
        return !isForbiddenLatinControl;
      })
      .join('');

    // Limita repetições excessivas (anti-flood)
    result = result.replace(RX_1_50_RE, '$1$1$1');

    return result;
  }
}

/**
 * Função utilitária para sanitizar texto fora do middleware.
 */
export function sanitizePromptInput(input: string): string {
  const middleware = new PromptSanitizerMiddleware();
  return middleware.sanitizeString(input);
}

function stripAlwaysRespondDirective(input: string): string {
  const normalized = input.toLowerCase();
  const startNeedle = 'por favor responda';
  const endNeedle = ' sempre';
  const start = normalized.indexOf(startNeedle);

  if (start < 0) {
    return input;
  }

  const end = normalized.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) {
    return input;
  }

  return `${input.slice(0, start)}[removed]${input.slice(end + endNeedle.length)}`.trim();
}
