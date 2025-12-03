import { Controller, Post, Req, UseGuards, Body } from '@nestjs/common';
import { MoneyMachineService } from './money-machine.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import * as QRCode from 'qrcode';

@Controller('growth')
@UseGuards(JwtAuthGuard)
export class GrowthController {
  constructor(private readonly moneyMachine: MoneyMachineService) {}

  @Post('money-machine/activate')
  async activate(@Req() req: any) {
    const workspaceId = resolveWorkspaceId(req);
    return this.moneyMachine.activate(workspaceId);
  }

  @Post('qr/whatsapp')
  async generateQr(
    @Req() req: any,
    @Body() body: { phone: string; message?: string },
  ) {
    const phone = (body?.phone || '').replace(/\D/g, '');
    const message = body?.message || 'Olá, quero saber mais!';
    if (!phone) {
      return { error: true, message: 'phone é obrigatório' };
    }

    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    const dataUrl = await QRCode.toDataURL(waUrl, { margin: 1 });
    return { dataUrl, waUrl };
  }
}
