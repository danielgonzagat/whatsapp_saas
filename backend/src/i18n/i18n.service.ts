import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { callOpenAIWithRetry } from '../kloel/openai-wrapper';

/**
 * Dicionário de traduções estáticas para mensagens comuns
 */
const translations: Record<string, Record<string, string>> = {
  'pt-BR': {
    // Saudações
    'greeting.welcome': 'Olá! Bem-vindo(a)! 👋',
    'greeting.morning': 'Bom dia! ☀️',
    'greeting.afternoon': 'Boa tarde! 🌤️',
    'greeting.evening': 'Boa noite! 🌙',
    
    // Onboarding
    'onboarding.start': 'Vamos configurar sua conta! É rápido e fácil.',
    'onboarding.complete': '🎉 Parabéns! Sua configuração está completa!',
    'onboarding.abandoned': 'Oi! Notei que você não terminou a configuração. Posso ajudar?',
    'onboarding.step_business': 'Qual é o nome do seu negócio?',
    'onboarding.step_segment': 'Em qual segmento você atua?',
    'onboarding.step_products': 'Quais produtos ou serviços você oferece?',
    
    // Pagamentos
    'payment.link_generated': 'Aqui está o link de pagamento: {link}',
    'payment.confirmed': '✅ Pagamento confirmado! Obrigado pela compra.',
    'payment.pending': '⏳ Pagamento pendente. Aguardando confirmação.',
    'payment.failed': '❌ Houve um problema com o pagamento. Tente novamente.',
    'payment.pix_instructions': 'Escaneie o QR Code ou copie o código PIX abaixo:',
    
    // Vendas
    'sales.discount_applied': '🎉 Desconto de {discount}% aplicado!',
    'sales.objection_handling': 'Entendo sua preocupação. Deixa eu te explicar...',
    'sales.meeting_scheduled': '📅 Reunião agendada para {date} às {time}.',
    'sales.follow_up': 'Oi! Queria saber se posso ajudar em algo mais.',
    
    // Suporte
    'support.ticket_created': 'Ticket #{id} criado. Em breve retornaremos.',
    'support.waiting': 'Um momento, estou verificando isso para você...',
    'support.resolved': '✅ Problema resolvido! Algo mais que posso ajudar?',
    
    // Erros
    'error.generic': 'Ops! Algo deu errado. Tente novamente em alguns instantes.',
    'error.not_found': 'Não encontrei o que você procura. Pode reformular?',
    'error.invalid_input': 'Não entendi. Pode explicar de outra forma?',
    
    // Confirmações
    'confirm.yes': 'Sim',
    'confirm.no': 'Não',
    'confirm.cancel': 'Cancelar',
    'confirm.continue': 'Continuar',
  },
  
  'en-US': {
    // Greetings
    'greeting.welcome': 'Hello! Welcome! 👋',
    'greeting.morning': 'Good morning! ☀️',
    'greeting.afternoon': 'Good afternoon! 🌤️',
    'greeting.evening': 'Good evening! 🌙',
    
    // Onboarding
    'onboarding.start': "Let's set up your account! It's quick and easy.",
    'onboarding.complete': '🎉 Congratulations! Your setup is complete!',
    'onboarding.abandoned': "Hi! I noticed you didn't finish the setup. Can I help?",
    'onboarding.step_business': "What's your business name?",
    'onboarding.step_segment': 'What industry are you in?',
    'onboarding.step_products': 'What products or services do you offer?',
    
    // Payments
    'payment.link_generated': 'Here is your payment link: {link}',
    'payment.confirmed': '✅ Payment confirmed! Thank you for your purchase.',
    'payment.pending': '⏳ Payment pending. Waiting for confirmation.',
    'payment.failed': '❌ There was a problem with the payment. Please try again.',
    'payment.pix_instructions': 'Scan the QR Code or copy the PIX code below:',
    
    // Sales
    'sales.discount_applied': '🎉 {discount}% discount applied!',
    'sales.objection_handling': 'I understand your concern. Let me explain...',
    'sales.meeting_scheduled': '📅 Meeting scheduled for {date} at {time}.',
    'sales.follow_up': 'Hi! Just checking in to see if I can help with anything.',
    
    // Support
    'support.ticket_created': 'Ticket #{id} created. We will get back to you soon.',
    'support.waiting': 'One moment, I am checking this for you...',
    'support.resolved': '✅ Issue resolved! Anything else I can help with?',
    
    // Errors
    'error.generic': 'Oops! Something went wrong. Please try again shortly.',
    'error.not_found': "I couldn't find what you're looking for. Can you rephrase?",
    'error.invalid_input': "I didn't understand. Could you explain differently?",
    
    // Confirmations
    'confirm.yes': 'Yes',
    'confirm.no': 'No',
    'confirm.cancel': 'Cancel',
    'confirm.continue': 'Continue',
  },
  
  'es-ES': {
    // Saludos
    'greeting.welcome': '¡Hola! ¡Bienvenido(a)! 👋',
    'greeting.morning': '¡Buenos días! ☀️',
    'greeting.afternoon': '¡Buenas tardes! 🌤️',
    'greeting.evening': '¡Buenas noches! 🌙',
    
    // Onboarding
    'onboarding.start': '¡Vamos a configurar tu cuenta! Es rápido y fácil.',
    'onboarding.complete': '🎉 ¡Felicidades! ¡Tu configuración está completa!',
    'onboarding.abandoned': '¡Hola! Noté que no terminaste la configuración. ¿Puedo ayudar?',
    'onboarding.step_business': '¿Cuál es el nombre de tu negocio?',
    'onboarding.step_segment': '¿En qué sector trabajas?',
    'onboarding.step_products': '¿Qué productos o servicios ofreces?',
    
    // Pagos
    'payment.link_generated': 'Aquí está el enlace de pago: {link}',
    'payment.confirmed': '✅ ¡Pago confirmado! Gracias por tu compra.',
    'payment.pending': '⏳ Pago pendiente. Esperando confirmación.',
    'payment.failed': '❌ Hubo un problema con el pago. Inténtalo de nuevo.',
    'payment.pix_instructions': 'Escanea el código QR o copia el código PIX a continuación:',
    
    // Ventas
    'sales.discount_applied': '🎉 ¡Descuento del {discount}% aplicado!',
    'sales.objection_handling': 'Entiendo tu preocupación. Déjame explicarte...',
    'sales.meeting_scheduled': '📅 Reunión programada para {date} a las {time}.',
    'sales.follow_up': '¡Hola! Quería saber si puedo ayudarte en algo más.',
    
    // Soporte
    'support.ticket_created': 'Ticket #{id} creado. Pronto te responderemos.',
    'support.waiting': 'Un momento, estoy verificando esto para ti...',
    'support.resolved': '✅ ¡Problema resuelto! ¿Algo más en que pueda ayudar?',
    
    // Errores
    'error.generic': '¡Ups! Algo salió mal. Intenta de nuevo en unos momentos.',
    'error.not_found': 'No encontré lo que buscas. ¿Puedes reformular?',
    'error.invalid_input': 'No entendí. ¿Puedes explicar de otra forma?',
    
    // Confirmaciones
    'confirm.yes': 'Sí',
    'confirm.no': 'No',
    'confirm.cancel': 'Cancelar',
    'confirm.continue': 'Continuar',
  },
};

/**
 * Mapa de detecção de idioma por código de país do WhatsApp
 */
const countryToLanguage: Record<string, string> = {
  '55': 'pt-BR', // Brasil
  '351': 'pt-BR', // Portugal
  '1': 'en-US', // EUA/Canadá
  '44': 'en-US', // Reino Unido
  '34': 'es-ES', // Espanha
  '52': 'es-ES', // México
  '54': 'es-ES', // Argentina
  '56': 'es-ES', // Chile
  '57': 'es-ES', // Colômbia
  '51': 'es-ES', // Peru
};

export type SupportedLanguage = 'pt-BR' | 'en-US' | 'es-ES';

@Injectable()
export class I18nService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Detecta o idioma a partir do número de telefone
   */
  detectLanguageFromPhone(phone: string): SupportedLanguage {
    // Remove caracteres não numéricos
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Tenta detectar pelo código do país
    for (const [code, lang] of Object.entries(countryToLanguage)) {
      if (cleanPhone.startsWith(code)) {
        return lang as SupportedLanguage;
      }
    }
    
    // Default: Português Brasil
    return 'pt-BR';
  }

  /**
   * Detecta o idioma de um texto usando OpenAI
   */
  async detectLanguageFromText(text: string): Promise<SupportedLanguage> {
    try {
      const response = await callOpenAIWithRetry(() =>
        this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a language detector. Respond with ONLY the language code: pt-BR, en-US, or es-ES. No other text.',
            },
            {
              role: 'user',
              content: `Detect the language of this text: "${text.slice(0, 200)}"`,
            },
          ],
          max_tokens: 10,
          temperature: 0,
        }),
      );

      const detected = response.choices[0]?.message?.content?.trim();
      
      if (detected && ['pt-BR', 'en-US', 'es-ES'].includes(detected)) {
        return detected as SupportedLanguage;
      }
    } catch (error) {
      console.error('[I18nService] Error detecting language:', error);
    }

    return 'pt-BR';
  }

  /**
   * Obtém uma tradução estática
   */
  t(
    key: string,
    lang: SupportedLanguage = 'pt-BR',
    params?: Record<string, string | number>,
  ): string {
    const langDict = translations[lang] || translations['pt-BR'];
    let text = langDict[key] || translations['pt-BR'][key] || key;

    // Substitui placeholders {param} por valores
    if (params) {
      for (const [param, value] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${param}\\}`, 'g'), String(value));
      }
    }

    return text;
  }

  /**
   * Traduz um texto dinâmico usando OpenAI
   */
  async translateText(
    text: string,
    targetLang: SupportedLanguage,
    sourceLang?: SupportedLanguage,
  ): Promise<string> {
    // Se já está no idioma alvo, retorna sem traduzir
    if (sourceLang === targetLang) {
      return text;
    }

    try {
      const langNames = {
        'pt-BR': 'Brazilian Portuguese',
        'en-US': 'American English',
        'es-ES': 'Spanish',
      };

      const response = await callOpenAIWithRetry(() =>
        this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are a translator. Translate the following text to ${langNames[targetLang]}. 
Keep the same tone and style. Preserve emojis and formatting. 
Respond ONLY with the translated text, no explanations.`,
            },
            {
              role: 'user',
              content: text,
            },
          ],
          max_tokens: 1000,
          temperature: 0.3,
        }),
      );

      return response.choices[0]?.message?.content?.trim() || text;
    } catch (error) {
      console.error('[I18nService] Translation error:', error);
      return text;
    }
  }

  /**
   * Traduz a resposta da IA para o idioma do usuário se necessário
   */
  async adaptResponseToUser(
    response: string,
    userLang: SupportedLanguage,
    responseLang: SupportedLanguage = 'pt-BR',
  ): Promise<string> {
    if (userLang === responseLang) {
      return response;
    }

    return this.translateText(response, userLang, responseLang);
  }

  /**
   * Obtém saudação apropriada para o horário
   */
  getTimeBasedGreeting(lang: SupportedLanguage = 'pt-BR'): string {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 12) {
      return this.t('greeting.morning', lang);
    } else if (hour >= 12 && hour < 18) {
      return this.t('greeting.afternoon', lang);
    } else {
      return this.t('greeting.evening', lang);
    }
  }

  /**
   * Retorna lista de idiomas suportados
   */
  getSupportedLanguages(): { code: SupportedLanguage; name: string }[] {
    return [
      { code: 'pt-BR', name: 'Português (Brasil)' },
      { code: 'en-US', name: 'English (US)' },
      { code: 'es-ES', name: 'Español' },
    ];
  }
}
