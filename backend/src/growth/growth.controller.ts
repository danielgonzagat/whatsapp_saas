import {
  Controller,
  Post,
  UseGuards,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { MoneyMachineService } from './money-machine.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import * as QRCode from 'qrcode';
import { WorkspaceGuard } from '../common/guards/workspace.guard';

@Controller('growth')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class GrowthController {
  constructor(private readonly moneyMachine: MoneyMachineService) {}

  // NOTE: POST /growth/money-machine/activate is handled by MoneyMachineController
  // to avoid duplicate route registration. See money-machine.controller.ts.

  @Post('qr/whatsapp')
  async generateQr(@Body() body: { phone: string; message?: string }) {
    const phone = (body?.phone || '').replace(/\D/g, '');
    const message = body?.message || 'Olá, quero saber mais!';
    if (!phone) {
      throw new BadRequestException('phone é obrigatório');
    }

    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    const dataUrl = await QRCode.toDataURL(waUrl, { margin: 1 });
    return { dataUrl, waUrl };
  }
}
