import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { forEachSequential } from '../common/async-sequence';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { MemoryService } from './memory.service';
import { chatCompletionWithRetry } from './openai-wrapper';

const JSON_N___N_RE = /```json\n?|\n?```/g;
const A_Z_A_Z0_9_RE = /[^a-zA-Z0-9]/g;

/** Pdf processor service. */
@Injectable()
export class PdfProcessorService {
  private readonly logger = new Logger(PdfProcessorService.name);
  private openai: OpenAI;

  constructor(
    private readonly memoryService: MemoryService,
    private readonly planLimits: PlanLimitsService,
  ) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  /**
   * 📄 Processa texto e extrai informações comerciais
   */
  async processText(workspaceId: string, text: string, sourceName: string) {
    this.logger.log(`Processando texto: ${sourceName}`);

    try {
      const analysis = await this.analyzeWithAI(workspaceId, text, sourceName);
      await this.saveToMemory(workspaceId, sourceName, analysis);
      return analysis;
    } catch (error) {
      this.logger.error(`Erro processando: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🧠 Análise com IA
   */
  private async analyzeWithAI(workspaceId: string, text: string, filename: string) {
    const prompt = `Analise o conteúdo comercial (${filename}) e extraia:

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

    try {
      await this.planLimits.ensureTokenBudget(workspaceId);
      const response = await chatCompletionWithRetry(this.openai, {
        model: resolveBackendOpenAIModel('brain'),
        messages: [
          {
            role: 'system',
            content: 'Analista de documentos comerciais. Retorne apenas JSON válido.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      });
      const content = response.choices[0]?.message?.content || '{}';
      const cleanJson = content.replace(JSON_N___N_RE, '').trim();
      return JSON.parse(cleanJson);
    } catch (error) {
      this.logger.error(`Erro na análise: ${error.message}`);
      return {
        products: [],
        companyInfo: '',
        salesScript: '',
        objections: [],
        keyPoints: [],
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
        price: product.price,
        benefits: product.benefits,
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
