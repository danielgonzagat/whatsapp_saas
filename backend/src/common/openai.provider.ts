import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/**
 * Provedor centralizado do cliente OpenAI.
 * Lê OPENAI_API_KEY e OPENAI_MODEL uma única vez e fornece a instância para todos os serviços.
 * Elimina duplicação de código e facilita diagnóstico de falhas.
 */
@Injectable()
export class OpenAIProvider {
  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly openai: OpenAI | null;
  private readonly _model: string;

  constructor(private readonly config: ConfigService) {
    const apiKey =
      this.config.get<string>('OPENAI_API_KEY') ||
      process.env.OPENAI_API_KEY;
    this._model =
      this.config.get<string>('OPENAI_MODEL') ||
      process.env.OPENAI_MODEL ||
      'gpt-4o-mini';

    const isTestEnv =
      !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';

    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
      if (!isTestEnv) {
        this.logger.log(
          `OpenAIProvider initialized with model ${this._model}`,
        );
      }
    } else {
      this.openai = null;
      if (!isTestEnv) {
        this.logger.error(
          'OPENAI_API_KEY not found; AI features will be disabled.',
        );
      }
    }
  }

  /** Retorna o cliente ou null se não configurado */
  get client(): OpenAI | null {
    return this.openai;
  }

  /** Retorna o modelo configurado (usar ao chamar API) */
  get defaultModel(): string {
    return this._model;
  }

  /** Verifica se o cliente está configurado */
  get isConfigured(): boolean {
    return this.openai !== null;
  }
}

@Global()
@Module({
  providers: [OpenAIProvider],
  exports: [OpenAIProvider],
})
export class OpenAIModule {}
