import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Middleware para sanitizar inputs de texto que vão para a IA.
 * Remove tentativas comuns de prompt injection e jailbreak.
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
    /por\s+favor\s+responda\s+.*\s+sempre/gi,
  ];

  use(req: Request, res: Response, next: NextFunction) {
    if (req.body) {
      this.sanitizeObject(req.body, req.path);
    }
    next();
  }

  private sanitizeObject(obj: any, path: string): void {
    if (!obj || typeof obj !== 'object') return;

    for (const key of Object.keys(obj)) {
      const value = obj[key];

      if (typeof value === 'string') {
        const sanitized = this.sanitizeString(value);
        if (sanitized !== value) {
          this.logger.warn(`Prompt injection detectado em ${path}.${key}`);
          obj[key] = sanitized;
        }
      } else if (typeof value === 'object') {
        this.sanitizeObject(value, `${path}.${key}`);
      }
    }
  }

  private sanitizeString(input: string): string {
    let result = input;

    for (const pattern of this.dangerousPatterns) {
      result = result.replace(pattern, '[removed]');
    }

    // Remove caracteres de controle Unicode (exceto newlines e tabs)
    result = result.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');

    // Limita repetições excessivas (anti-flood)
    result = result.replace(/(.)\1{50,}/g, '$1$1$1');

    return result;
  }
}

/**
 * Função utilitária para sanitizar texto fora do middleware.
 */
export function sanitizePromptInput(input: string): string {
  const middleware = new PromptSanitizerMiddleware();
  return (middleware as any).sanitizeString(input);
}
