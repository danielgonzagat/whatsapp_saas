import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { KycService } from './kyc.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateFiscalDto } from './dto/update-fiscal.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';

@Controller('kyc')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class KycController {
  constructor(private readonly kycService: KycService) {}

  // ═══ PROFILE ═══

  @Get('profile')
  async getProfile(@Req() req: any) {
    return this.kycService.getProfile(req.user.sub);
  }

  @Put('profile')
  async updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.kycService.updateProfile(req.user.sub, dto);
  }

  @Post('profile/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
        cb(null, allowed.test(file.originalname));
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadAvatar(
    @Req() req: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|gif|webp)$/ }),
        ],
      }),
    )
    file: any,
  ) {
    return this.kycService.uploadAvatar(req.user.sub, file);
  }

  // ═══ FISCAL ═══

  @Get('fiscal')
  async getFiscal(@Req() req: any) {
    return this.kycService.getFiscal(req.user.workspaceId);
  }

  @Put('fiscal')
  async updateFiscal(@Req() req: any, @Body() dto: UpdateFiscalDto) {
    return this.kycService.updateFiscal(req.user.workspaceId, dto);
  }

  // ═══ DOCUMENTS ═══

  @Get('documents')
  async getDocuments(@Req() req: any) {
    return this.kycService.getDocuments(req.user.sub, req.user.workspaceId);
  }

  @Post('documents/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const allowed = /\.(jpg|jpeg|png|gif|webp|pdf)$/i;
        cb(null, allowed.test(file.originalname));
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadDocument(
    @Req() req: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({
            fileType: /^(image\/(jpeg|png|gif|webp)|application\/pdf)$/,
          }),
        ],
      }),
    )
    file: any,
    @Body() body: { type: string },
  ) {
    return this.kycService.uploadDocument(req.user.sub, req.user.workspaceId, body.type, file);
  }

  @Delete('documents/:id')
  async deleteDocument(@Req() req: any, @Param('id') id: string) {
    return this.kycService.deleteDocument(req.user.sub, id);
  }

  // ═══ BANK ═══

  @Get('bank')
  async getBankAccount(@Req() req: any) {
    return this.kycService.getBankAccount(req.user.workspaceId);
  }

  @Put('bank')
  async updateBankAccount(@Req() req: any, @Body() dto: UpdateBankDto) {
    return this.kycService.updateBankAccount(req.user.workspaceId, dto);
  }

  // ═══ SECURITY ═══

  @Post('security/change-password')
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.kycService.changePassword(req.user.sub, dto);
  }

  // ═══ KYC STATUS ═══

  @Get('status')
  async getStatus(@Req() req: any) {
    return this.kycService.getStatus(req.user.sub);
  }

  @Get('completion')
  async getCompletion(@Req() req: any) {
    return this.kycService.getCompletion(req.user.sub, req.user.workspaceId);
  }

  @Post('submit')
  async submitKyc(@Req() req: any) {
    return this.kycService.submitKyc(req.user.sub, req.user.workspaceId);
  }

  // ═══ AUTO-APPROVAL & ADMIN ═══

  @Post('auto-check')
  async autoCheck(@Req() req: any) {
    return this.kycService.autoApproveIfComplete(req.user.sub, req.user.workspaceId);
  }

  @Post(':agentId/approve')
  async adminApprove(@Req() req: any, @Param('agentId') agentId: string) {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can approve KYC');
    }
    return this.kycService.adminApprove(agentId);
  }
}
