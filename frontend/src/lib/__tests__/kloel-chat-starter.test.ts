import { describe, expect, it } from 'vitest';

import { getKloelStarterConfig } from '@/lib/kloel-chat-starter';

describe('kloel chat starter', () => {
  it('uses a commercial proof starter on landing', () => {
    const config = getKloelStarterConfig({ surface: 'landing' });

    expect(config.greeting).toContain('qual seria o próximo passo');
    expect(config.suggestedPrompts).toHaveLength(3);
    expect(config.ctaLabel).toContain('ligar meu WhatsApp');
  });

  it('prioritizes WhatsApp activation for disconnected authenticated users', () => {
    const config = getKloelStarterConfig({
      surface: 'dashboard',
      isAuthenticated: true,
      isWhatsAppConnected: false,
      justSignedUp: true,
      userName: 'Daniel',
    });

    expect(config.greeting).toContain('Daniel');
    expect(config.placeholder).toContain('ligar seu WhatsApp');
    expect(config.quickActions[0]).toMatchObject({
      id: 'connect-whatsapp',
      kind: 'connect_whatsapp',
    });
  });

  it('switches to operations language once WhatsApp is connected', () => {
    const config = getKloelStarterConfig({
      surface: 'dashboard',
      isAuthenticated: true,
      isWhatsAppConnected: true,
      userName: 'Ana',
    });

    expect(config.greeting).toContain('Ana');
    expect(config.placeholder).toContain('ação');
    expect(config.quickActions[0].kind).toBe('send_prompt');
  });
});
