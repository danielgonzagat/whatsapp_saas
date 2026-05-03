import { randomInt } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { issueTokens, type TokenIssuanceResult } from './tokens';
import type { AuthPartsDeps } from './register-login';

export interface WhatsAppCodeResult {
  success: boolean;
  message: string;
  code?: string;
}

const D_RE = /\D/g;

export async function sendWhatsAppCode(
  deps: AuthPartsDeps,
  phone: string,
  ip?: string,
): Promise<WhatsAppCodeResult> {
  await deps.rateLimitService.checkRateLimit(`whatsapp-code:${ip || 'ip-unknown'}`, 3, 60 * 1000);

  const code = String(randomInt(100000, 999999));

  if (deps.redis) {
    await deps.redis.setex(`whatsapp-verify:${phone}`, 300, code);
  } else {
    deps.logger.warn('Redis não disponível, código WhatsApp não persistido');
  }

  const metaToken = deps.config.get<string>('META_ACCESS_TOKEN');
  const metaPhoneId = deps.config.get<string>('META_PHONE_NUMBER_ID');

  if (metaToken && metaPhoneId) {
    try {
      const message = `Seu código de verificação KLOEL é: *${code}*\n\nEsse código expira em 5 minutos. Não compartilhe com ninguém.`;

      const response = await fetch(`https://graph.facebook.com/v19.0/${metaPhoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${metaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone.replace(D_RE, ''),
          type: 'text',
          text: { body: message },
        }),
        signal: AbortSignal.timeout(30000),
      });

      const result = await response.json();

      if (result.error) {
        deps.logger.error(`WhatsApp API: erro ao enviar código: ${result.error.message}`);
      } else {
        deps.logger.log(`WhatsApp API: código enviado para ${phone}`);
        return {
          success: true,
          message: 'Código enviado via WhatsApp',
        };
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'unknown error';
      deps.logger.error(
        `WhatsApp API: erro ao enviar código: ${errorMessage}`,
        error instanceof Error && typeof error.stack === 'string' ? error.stack : undefined,
      );
    }
  }

  deps.logger.debug(`WhatsApp Code (dev): ${phone}: ${code}`);

  return {
    success: true,
    message: 'Código enviado via WhatsApp',
    ...(process.env.NODE_ENV !== 'production' && { code }),
  };
}

export async function verifyWhatsAppCode(
  deps: AuthPartsDeps,
  phone: string,
  code: string,
  ip?: string,
): Promise<TokenIssuanceResult> {
  await deps.rateLimitService.checkRateLimit(`whatsapp-verify:${ip || 'ip-unknown'}`, 5, 60 * 1000);

  let storedCode: string | null = null;

  if (deps.redis) {
    storedCode = await deps.redis.get(`whatsapp-verify:${phone}`);
  }

  if (!storedCode || storedCode !== code) {
    throw new UnauthorizedException('Código inválido ou expirado');
  }

  if (deps.redis) {
    await deps.redis.del(`whatsapp-verify:${phone}`);
  }

  let agent = await deps.prisma.agent.findFirst({
    where: { phone },
  });

  if (!agent) {
    const workspace = await deps.prisma.workspace.create({
      data: { name: `WhatsApp User` },
    });

    agent = await deps.prisma.agent.create({
      data: {
        name: `User ${phone.slice(-4)}`,
        email: `${phone}@whatsapp.kloel.com`,
        password: '',
        role: 'ADMIN',
        workspaceId: workspace.id,
        phone,
        provider: 'whatsapp',
        providerId: phone,
      },
    });
  }

  return issueTokens(deps.prisma, deps.jwt, deps.logger, agent);
}
