import { Controller, Post, Body, Param, Logger, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiParam, ApiConsumes } from '@nestjs/swagger';
import { PdfProcessorService } from './pdf-processor.service';

@ApiTags('KLOEL PDF Processor')
@Controller('kloel/pdf')
export class PdfProcessorController {
  private readonly logger = new Logger(PdfProcessorController.name);

  constructor(private readonly pdfProcessor: PdfProcessorService) {}

  @Post(':workspaceId/upload')
  @ApiOperation({ summary: 'Upload e processa PDF' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPdf(
    @Param('workspaceId') workspaceId: string,
    @UploadedFile() file: any,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    
    this.logger.log(`Processando PDF: ${file.originalname}`);
    
    // Para PDFs, precisaria de pdf-parse - por ora aceita texto
    const text = file.buffer.toString('utf-8');
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
