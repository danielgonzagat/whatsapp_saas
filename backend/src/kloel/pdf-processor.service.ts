import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryService } from './memory.service';
import OpenAI from 'openai';

@Injectable()
export class PdfProcessorService {
  private readonly logger = new Logger(PdfProcessorService.name);
  private openai: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly memoryService: MemoryService,
  ) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  /**
   * 📄 Processa texto e extrai informações comerciais
   */
  async processText(workspaceId: string, text: string, sourceName: string) {
    this.logger.log(`Processando texto: ${sourceName}`);

    try {
      const analysis = await this.analyzeWithAI(text, sourceName);
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
  private async analyzeWithAI(text: string, filename: string) {
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
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'Analista de documentos comerciais. Retorne apenas JSON válido.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const cleanJson = content.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (error) {
      this.logger.error(`Erro na análise: ${error.message}`);
      return { products: [], companyInfo: '', salesScript: '', objections: [], keyPoints: [] };
    }
  }

  /**
   * 💾 Salva análise na memória
   */
  private async saveToMemory(workspaceId: string, sourceName: string, analysis: any) {
    const pdfId = sourceName.replace(/[^a-zA-Z0-9]/g, '_');

    for (let i = 0; i < analysis.products.length; i++) {
      const product = analysis.products[i];
      await this.memoryService.saveProduct(workspaceId, `${pdfId}_product_${i}`, {
        name: product.name,
        description: product.description,
        price: product.price,
        benefits: product.benefits,
      });
    }

    if (analysis.companyInfo) {
      await this.memoryService.saveMemory(workspaceId, `${pdfId}_company_info`, { source: sourceName }, 'company_info', analysis.companyInfo);
    }

    if (analysis.salesScript) {
      await this.memoryService.saveMemory(workspaceId, `${pdfId}_sales_script`, { source: sourceName }, 'script', analysis.salesScript);
    }

    for (let i = 0; i < analysis.objections.length; i++) {
      const obj = analysis.objections[i];
      await this.memoryService.saveMemory(
        workspaceId, `${pdfId}_objection_${i}`, obj, 'objection',
        `OBJEÇÃO: ${obj.objection}\nRESPOSTA: ${obj.response}`
      );
    }

    this.logger.log(`Análise salva: ${analysis.products.length} produtos, ${analysis.objections.length} objeções`);
  }
}
