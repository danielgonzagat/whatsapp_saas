import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  ForbiddenException,
  Get,
  Headers,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { ChangePasswordDto } from './dto/change-password.dto';
import { KycDocumentTypeDto } from './dto/kyc-document-type.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { UpdateFiscalDto } from './dto/update-fiscal.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { KycService } from './kyc.service';

const JPG_JPEG_PNG_GIF_WEBP_RE = /\.(jpg|jpeg|png|gif|webp)$/i;
const IMAGE___JPEG_PNG_GIF_WE_RE = /^image\/(jpeg|png|gif|webp)$/;
const JPG_JPEG_PNG_GIF_WEBP_RE_2 = /\.(jpg|jpeg|png|gif|webp|pdf)$/i;
const IMAGE___JPEG_PNG_GIF_W_RE = /^(image\/(jpeg|png|gif|webp)|application\/pdf)$/;
type UploadedKycFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

/** Kyc controller. */
@Controller('kyc')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class KycController {
  constructor(private readonly kycService: KycService) {}

  // ═══ PROFILE ═══

  @Get('profile')
  async getProfile(@Req() req: AuthenticatedRequest) {
    return this.kycService.getProfile(req.user.sub);
  }

  /** Update profile. */
  @Put('profile')
  async updateProfile(@Req() req: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.kycService.updateProfile(req.user.sub, dto);
  }

  /** Upload avatar. */
  @Post('profile/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const allowed = JPG_JPEG_PNG_GIF_WEBP_RE;
        cb(null, allowed.test(file.originalname));
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadAvatar(
    @Req() req: AuthenticatedRequest,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: IMAGE___JPEG_PNG_GIF_WE_RE }),
        ],
      }),
    )
    file: UploadedKycFile,
  ) {
    return this.kycService.uploadAvatar(req.user.sub, file);
  }

  // ═══ FISCAL ═══

  @Get('fiscal')
  async getFiscal(@Req() req: AuthenticatedRequest) {
    return this.kycService.getFiscal(req.user.workspaceId);
  }

  /** Update fiscal. */
  @Put('fiscal')
  async updateFiscal(@Req() req: AuthenticatedRequest, @Body() dto: UpdateFiscalDto) {
    return this.kycService.updateFiscal(req.user.workspaceId, dto);
  }

  // ═══ DOCUMENTS ═══

  @Get('documents')
  async getDocuments(@Req() req: AuthenticatedRequest) {
    return this.kycService.getDocuments(req.user.sub, req.user.workspaceId);
  }

  /** Upload document. */
  @Post('documents/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const allowed = JPG_JPEG_PNG_GIF_WEBP_RE_2;
        cb(null, allowed.test(file.originalname));
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadDocument(
    @Req() req: AuthenticatedRequest,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({
            fileType: IMAGE___JPEG_PNG_GIF_W_RE,
          }),
        ],
      }),
    )
    file: UploadedKycFile,
    @Body() body: KycDocumentTypeDto,
  ) {
    return this.kycService.uploadDocument(req.user.sub, req.user.workspaceId, body.type, file);
  }

  /** Delete document. */
  @Delete('documents/:id')
  async deleteDocument(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.kycService.deleteDocument(req.user.sub, id);
  }

  // ═══ BANK ═══

  @Get('bank')
  async getBankAccount(@Req() req: AuthenticatedRequest) {
    return this.kycService.getBankAccount(req.user.workspaceId);
  }

  /** Update bank account. */
  @Put('bank')
  async updateBankAccount(@Req() req: AuthenticatedRequest, @Body() dto: UpdateBankDto) {
    return this.kycService.updateBankAccount(req.user.workspaceId, dto);
  }

  // ═══ SECURITY ═══

  @Post('security/change-password')
  async changePassword(@Req() req: AuthenticatedRequest, @Body() dto: ChangePasswordDto) {
    return this.kycService.changePassword(req.user.sub, dto);
  }

  // ═══ KYC STATUS ═══

  @Get('status')
  async getStatus(@Req() req: AuthenticatedRequest) {
    return this.kycService.getStatus(req.user.sub);
  }

  /** Get completion. */
  @Get('completion')
  async getCompletion(@Req() req: AuthenticatedRequest) {
    return this.kycService.getCompletion(req.user.sub, req.user.workspaceId);
  }

  /** Submit kyc. */
  @Post('submit')
  async submitKyc(
    @Req() req: AuthenticatedRequest,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-forwarded-for') forwardedFor?: string,
  ) {
    const ipAddress =
      typeof forwardedFor === 'string' && forwardedFor.trim()
        ? forwardedFor.split(',')[0]?.trim() || undefined
        : undefined;

    return this.kycService.submitKyc(req.user.sub, req.user.workspaceId, {
      ipAddress,
      userAgent,
    });
  }

  // ═══ AUTO-APPROVAL & ADMIN ═══

  @Post('auto-check')
  async autoCheck(@Req() req: AuthenticatedRequest) {
    return this.kycService.autoApproveIfComplete(req.user.sub, req.user.workspaceId);
  }

  /** Admin approve. */
  @Post(':agentId/approve')
  async adminApprove(@Req() req: AuthenticatedRequest, @Param('agentId') agentId: string) {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can approve KYC');
    }
    return this.kycService.adminApprove(agentId);
  }
}
