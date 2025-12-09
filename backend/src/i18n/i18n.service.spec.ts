import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from './i18n.service';
import OpenAI from 'openai';

describe('I18nService', () => {
  let service: I18nService;

  beforeEach(async () => {
    const mockOpenAI = { chat: { completions: { create: jest.fn() } } } as unknown as OpenAI;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        I18nService,
        {
          provide: OpenAI,
          useValue: mockOpenAI,
        },
      ],
    }).compile();

    service = module.get<I18nService>(I18nService);
  });

  describe('detectLanguageFromPhone', () => {
    it('should detect pt-BR for Brazilian numbers', () => {
      expect(service.detectLanguageFromPhone('5511999999999')).toBe('pt-BR');
      expect(service.detectLanguageFromPhone('+55 11 99999-9999')).toBe('pt-BR');
    });

    it('should detect en-US for US numbers', () => {
      expect(service.detectLanguageFromPhone('12025551234')).toBe('en-US');
      expect(service.detectLanguageFromPhone('+1 202 555 1234')).toBe('en-US');
    });

    it('should detect es-ES for Spanish-speaking countries', () => {
      expect(service.detectLanguageFromPhone('34612345678')).toBe('es-ES');
      expect(service.detectLanguageFromPhone('5215512345678')).toBe('es-ES');
      expect(service.detectLanguageFromPhone('5491123456789')).toBe('es-ES');
    });

    it('should default to pt-BR for unknown country codes', () => {
      expect(service.detectLanguageFromPhone('9999999999')).toBe('pt-BR');
    });
  });

  describe('t (translation)', () => {
    it('should return correct translation for pt-BR', () => {
      expect(service.t('greeting.welcome', 'pt-BR')).toBe('Olá! Bem-vindo(a)! 👋');
      expect(service.t('payment.confirmed', 'pt-BR')).toBe('✅ Pagamento confirmado! Obrigado pela compra.');
    });

    it('should return correct translation for en-US', () => {
      expect(service.t('greeting.welcome', 'en-US')).toBe('Hello! Welcome! 👋');
      expect(service.t('payment.confirmed', 'en-US')).toBe('✅ Payment confirmed! Thank you for your purchase.');
    });

    it('should return correct translation for es-ES', () => {
      expect(service.t('greeting.welcome', 'es-ES')).toBe('¡Hola! ¡Bienvenido(a)! 👋');
      expect(service.t('payment.confirmed', 'es-ES')).toBe('✅ ¡Pago confirmado! Gracias por tu compra.');
    });

    it('should replace parameters in translation', () => {
      const result = service.t('sales.discount_applied', 'pt-BR', { discount: 20 });
      expect(result).toBe('🎉 Desconto de 20% aplicado!');
    });

    it('should replace multiple parameters', () => {
      const result = service.t('sales.meeting_scheduled', 'en-US', { 
        date: '2024-01-15', 
        time: '14:00' 
      });
      expect(result).toBe('📅 Meeting scheduled for 2024-01-15 at 14:00.');
    });

    it('should fallback to pt-BR if translation not found', () => {
      const result = service.t('unknown.key', 'en-US');
      expect(result).toBe('unknown.key'); // Returns key if not found
    });
  });

  describe('getTimeBasedGreeting', () => {
    it('should return appropriate greeting for time of day', () => {
      // These tests depend on current time, so we just verify the format
      const greeting = service.getTimeBasedGreeting('pt-BR');
      expect(greeting).toMatch(/^(Bom dia|Boa tarde|Boa noite)!/);
    });

    it('should return greeting in correct language', () => {
      const greetingEN = service.getTimeBasedGreeting('en-US');
      expect(greetingEN).toMatch(/^Good (morning|afternoon|evening)!/);
      
      const greetingES = service.getTimeBasedGreeting('es-ES');
      expect(greetingES).toMatch(/^¡Buen[oa]s? (d[ií]as|tardes|noches)!/);
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return all supported languages', () => {
      const languages = service.getSupportedLanguages();
      
      expect(languages).toHaveLength(3);
      expect(languages.map(l => l.code)).toContain('pt-BR');
      expect(languages.map(l => l.code)).toContain('en-US');
      expect(languages.map(l => l.code)).toContain('es-ES');
    });
  });
});
