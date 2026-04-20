import OpenAI from 'openai';
import type {
  ChatCompletionMessage,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { resolveWorkerOpenAIModel } from './openai-models';

/**
 * =====================================================================
 * AI PROVIDER — WRAPPER SIMPLIFICADO
 * =====================================================================
 */
export class AIProvider {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  private resolveModel(modelOrRole?: string): string {
    switch (modelOrRole) {
      case 'brain':
      case 'brain_fallback':
      case 'writer':
      case 'writer_fallback':
      case 'audio_understanding':
      case 'audio_understanding_fallback':
        return resolveWorkerOpenAIModel(modelOrRole);
      default:
        return modelOrRole || resolveWorkerOpenAIModel('writer');
    }
  }

  /** Generate response. */
  async generateResponse(
    systemPrompt: string,
    userMessage: string,
    model = 'writer',
  ): Promise<string> {
    const msg = await this.generateChatResponse(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      model,
    );
    return msg?.content || '';
  }

  // Backward compat helper used by some processors
  async generateText(prompt: string, model = 'writer'): Promise<string> {
    const msg = await this.generateChatResponse([{ role: 'user', content: prompt }], model);
    return msg?.content || '';
  }

  /** Generate chat response. */
  async generateChatResponse(
    messages: ChatCompletionMessageParam[],
    model = 'writer',
    tools?: OpenAI.ChatCompletionTool[],
  ): Promise<ChatCompletionMessage> {
    try {
      const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
        messages,
        model: this.resolveModel(model),
      };

      if (tools && tools.length > 0) {
        params.tools = tools;
        params.tool_choice = 'auto';
      }

      const completion = await this.openai.chat.completions.create(params);
      return completion.choices[0].message;
    } catch (error) {
      console.error('Erro na AI:', error);
      throw error;
    }
  }
}
