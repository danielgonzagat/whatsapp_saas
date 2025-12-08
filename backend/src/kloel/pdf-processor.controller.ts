import { Controller, Post, Body, Param, Logger, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiParam, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { PdfProcessorService } from './pdf-processor.service';
import { PDFParse } from 'pdf-parse';

@ApiTags('KLOEL PDF Processor')
@Controller('kloel/pdf')
export class PdfProcessorController {
  private readonly logger = new Logger(PdfProcessorController.name);

  constructor(private readonly pdfProcessor: PdfProcessorService) {}

  @Post(':workspaceId/upload')
  @ApiOperation({ summary: 'Upload e processa PDF' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Arquivo PDF para upload',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadPdf(
    @Param('workspaceId') workspaceId: string,
    @UploadedFile() file: any,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    
    this.logger.log(`Processando PDF: ${file.originalname}`);
    
    // Extrair texto do PDF usando pdf-parse
    let text: string;
    
    if (file.mimetype === 'application/pdf') {
      try {
        const parser = new PDFParse({ data: file.buffer });
        const textResult = await parser.getText();
        text = textResult.text;
        this.logger.log(`PDF extraído: ${textResult.pages.length} páginas, ${text.length} caracteres`);
      } catch (error) {
        this.logger.error(`Erro ao extrair PDF: ${error.message}`);
        throw new BadRequestException('Não foi possível extrair texto do PDF. Verifique se o arquivo é um PDF válido.');
      }
    } else if (file.mimetype === 'text/plain' || file.originalname.endsWith('.txt')) {
      // Aceita arquivos de texto também
      text = file.buffer.toString('utf-8');
    } else {
      throw new BadRequestException(`Tipo de arquivo não suportado: ${file.mimetype}. Use PDF ou TXT.`);
    }
    
    if (!text || text.trim().length < 10) {
      throw new BadRequestException('O documento não contém texto suficiente para análise.');
    }
    
    const analysis = await this.pdfProcessor.processText(workspaceId, text, file.originalname);

    return {
      status: 'processed',
      filename: file.originalname,
      analysis: {
        products: analysis.products?.length || 0,
        hasCompanyInfo: !!analysis.companyInfo,
        hasSalesScript: !!analysis.salesScript,
        objections: analysis.objections?.length || 0,
      },
      details: analysis,
    };
  }

  @Post(':workspaceId/text')
  @ApiOperation({ summary: 'Processa texto direto' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  async processText(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { text: string; sourceName: string },
  ) {
    if (!body.text || !body.sourceName) throw new BadRequestException('Texto e sourceName são obrigatórios');
    
    const analysis = await this.pdfProcessor.processText(workspaceId, body.text, body.sourceName);

    return {
      status: 'processed',
      sourceName: body.sourceName,
      textLength: body.text.length,
      analysis: {
        products: analysis.products?.length || 0,
        hasCompanyInfo: !!analysis.companyInfo,
        objections: analysis.objections?.length || 0,
      },
      details: analysis,
    };
  }
}
