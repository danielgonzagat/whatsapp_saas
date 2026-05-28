import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { forEachSequential } from '../common/async-sequence';
import { createTextLlmClient } from '../lib/llm-provider';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { MemoryService } from './memory.service';
import { chatCompletionWithRetry } from './openai-wrapper';

import { JSON_CODE_FENCE_RE } from '../common/regex';
const A_Z_A_Z0_9_RE = /[^a-zA-Z0-9]/g;
/** Output contract used by document analysis calls and cost quotes. */
export const PDF_ANALYSIS_OUTPUT_CONTRACT =
  'Analise o documento comercial e devolva apenas JSON valido no schema solicitado.';

type PdfAnalysis = Record<string, unknown>;

type PdfProcessorUsage = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  prompt_tokens_details?: {
    cached_tokens?: number | null;
  } | null;
  total_tokens?: number | null;
} | null;

/** Build pdf analysis prompt. */
export function buildPdfAnalysisPrompt(text: string, filename: string): string {
  return `Analise o conteúdo comercial (${filename}) e extraia:

CONTEÚDO:
${text.substring(0, 15000)}

Retorne JSON:
{
  "products": [{"name": "...", "description": "...", "price": 0, "benefits": ["..."]}],
  "companyInfo": "...",
  "salesScript": "...",
  "objections": [{"objection": "...", "response": "..."}],
  "keyPoints": ["..."]
}`;
}

/** Pdf processor service. */
@Injectable()
export class PdfProcessorService {
  private readonly logger = StructuredLogger.from(PdfProcessorService.name);
  private openai: OpenAI;

  constructor(
    private readonly memoryService: MemoryService,
    private readonly planLimits: PlanLimitsService,
  ) {
    this.openai = createTextLlmClient() ?? new OpenAI({ apiKey: 'missing' });
  }

  /**
   * 📄 Processa texto e extrai informações comerciais
   */
  async processText(workspaceId: string, text: string, sourceName: string) {
    const result = await this.processTextWithUsage(workspaceId, text, sourceName);
    return result.analysis;
  }

  /** Process text with usage. */
  async processTextWithUsage(workspaceId: string, text: string, sourceName: string) {
    this.logger.log(`Processando texto: ${sourceName}`);

    try {
      const analysisResult = await this.analyzeWithAI(workspaceId, text, sourceName, true);
      await this.saveToMemory(workspaceId, sourceName, analysisResult.analysis);
      return analysisResult;
    } catch (error: unknown) {
      this.logger.error(
        `Erro processando: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * 🧠 Análise com IA
   */
  private async analyzeWithAI(
    workspaceId: string,
    text: string,
    filename: string,
    strict = false,
  ): Promise<{ analysis: Record<string, unknown>; usage: PdfProcessorUsage }> {
    const prompt = buildPdfAnalysisPrompt(text, filename);

    try {
      await this.planLimits.ensureTokenBudget(workspaceId);
      const response = await chatCompletionWithRetry(this.openai, {
        model: resolveBackendOpenAIModel('brain'),
        messages: [
          { role: 'user', content: JSON.stringify({ contract: PDF_ANALYSIS_OUTPUT_CONTRACT }) },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 256,
      });
      const content = response.choices[0]?.message?.content || '{}';
      const cleanJson = content.replace(JSON_CODE_FENCE_RE, '').trim();
      const tokens = response?.usage?.total_tokens ?? 256;
      this.logger.log(
        `pdf-analysis ws=${workspaceId} model=brain baseLen=${prompt.length} outLen=${cleanJson.length} tokens=${tokens}`,
      );
      const analysis = JSON.parse(cleanJson) as PdfAnalysis;
      if (!analysis || Object.keys(analysis).length === 0) {
        this.logger.warn(`pdf-analysis empty result ws=${workspaceId}`);
      }
      return {
        analysis,
        usage: (response.usage ?? null) as PdfProcessorUsage,
      };
    } catch (error: unknown) {
      this.logger.error(
        `Erro na análise: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (strict) {
        throw error;
      }
      return {
        analysis: {
          products: [],
          companyInfo: '',
          salesScript: '',
          objections: [],
          keyPoints: [],
        },
        usage: null,
      };
    }
  }

  /**
   * 💾 Salva análise na memória
   */
  private async saveToMemory(
    workspaceId: string,
    sourceName: string,
    analysis: Record<string, unknown>,
  ) {
    const pdfId = sourceName.replace(A_Z_A_Z0_9_RE, '_');

    const products = (analysis.products || []) as Array<{
      name: string;
      description: string;
      price?: number;
      benefits?: string[];
    }>;
    await forEachSequential(products, async (product, i) => {
      await this.memoryService.saveProduct(workspaceId, `${pdfId}_product_${i}`, {
        name: product.name,
        description: product.description,
        price: product.price ?? 0,
        ...(product.benefits !== undefined ? { benefits: product.benefits } : {}),
      });
    });

    if (analysis.companyInfo as string) {
      await this.memoryService.saveMemory(
        workspaceId,
        `${pdfId}_company_info`,
        { source: sourceName },
        'company_info',
        analysis.companyInfo as string,
      );
    }

    if (analysis.salesScript as string) {
      await this.memoryService.saveMemory(
        workspaceId,
        `${pdfId}_sales_script`,
        { source: sourceName },
        'script',
        analysis.salesScript as string,
      );
    }

    const objections = (analysis.objections || []) as Array<{
      objection: string;
      response: string;
    }>;
    await forEachSequential(objections, async (obj, i) => {
      await this.memoryService.saveMemory(
        workspaceId,
        `${pdfId}_objection_${i}`,
        obj,
        'objection',
        `OBJEÇÃO: ${obj.objection}\nRESPOSTA: ${obj.response}`,
      );
    });

    this.logger.log(
      'Analise salva: ' +
        String(products.length) +
        ' produtos, ' +
        String(objections.length) +
        ' objecoes',
    );
  }
}
