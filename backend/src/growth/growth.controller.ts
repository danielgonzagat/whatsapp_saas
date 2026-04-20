import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { toDataURL as qrToDataURL } from 'qrcode';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';

const D_RE = /\D/g;

/** Growth controller. */
@Controller('growth')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class GrowthController {
  // NOTE: POST /growth/money-machine/activate is handled by MoneyMachineController
  // to avoid duplicate route registration. See money-machine.controller.ts.

  @Post('qr/whatsapp')
  async generateQr(@Body() body: { phone: string; message?: string }) {
    const phone = (body?.phone || '').replace(D_RE, '');
    const message = body?.message || 'Olá, quero saber mais!';
    if (!phone) {
      throw new BadRequestException('phone é obrigatório');
    }

    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    const dataUrl = await qrToDataURL(waUrl, { margin: 1 });
    return { dataUrl, waUrl };
  }
}
