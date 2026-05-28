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
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
import { RouteClass } from '../common/throttler/route-class.decorator';
import { InternalEndpoint } from '../common/decorators/internal-endpoint.decorator';

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
@ApiTags('KYC')
@Controller('kyc')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('auth')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  // ═══ PROFILE ═══

  @ApiOperation({ summary: 'Get KYC profile for the authenticated user' })
  @ApiResponse({ status: 200, description: 'KYC profile data' })
  @Get('profile')
  async getProfile(@Req() req: AuthenticatedRequest) {
    return this.kycService.getProfile(req.user.sub);
  }

  /** Update profile. */
  @ApiOperation({ summary: 'Update KYC profile information' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  @ApiResponse({ status: 400, description: 'Invalid profile data' })
  @ApiBody({ type: UpdateProfileDto })
  @Put('profile')
  async updateProfile(@Req() req: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.kycService.updateProfile(req.user.sub, dto);
  }

  /** Upload avatar. */
  @ApiOperation({ summary: 'Upload a profile avatar image' })
  @ApiResponse({ status: 201, description: 'Avatar uploaded' })
  @ApiResponse({ status: 400, description: 'Invalid file' })
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

  @ApiOperation({ summary: 'Get fiscal/tax information for the workspace' })
  @ApiResponse({ status: 200, description: 'Fiscal data' })
  @Get('fiscal')
  async getFiscal(@Req() req: AuthenticatedRequest) {
    return this.kycService.getFiscal(req.user.workspaceId);
  }

  /** Update fiscal. */
  @ApiOperation({ summary: 'Update fiscal/tax information' })
  @ApiResponse({ status: 200, description: 'Fiscal data updated' })
  @ApiResponse({ status: 400, description: 'Invalid fiscal data' })
  @ApiBody({ type: UpdateFiscalDto })
  @Put('fiscal')
  async updateFiscal(@Req() req: AuthenticatedRequest, @Body() dto: UpdateFiscalDto) {
    return this.kycService.updateFiscal(req.user.workspaceId, dto);
  }

  // ═══ DOCUMENTS ═══

  @ApiOperation({ summary: 'List KYC documents for the user and workspace' })
  @ApiResponse({ status: 200, description: 'List of documents' })
  @Get('documents')
  async getDocuments(@Req() req: AuthenticatedRequest) {
    return this.kycService.getDocuments(req.user.sub, req.user.workspaceId);
  }

  /** Upload document. */
  @ApiOperation({ summary: 'Upload a KYC document' })
  @ApiResponse({ status: 201, description: 'Document uploaded' })
  @ApiResponse({ status: 400, description: 'Invalid document' })
  @ApiBody({ type: KycDocumentTypeDto })
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
  @ApiOperation({ summary: 'Delete a KYC document' })
  @ApiResponse({ status: 200, description: 'Document deleted' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  @Delete('documents/:id')
  async deleteDocument(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.kycService.deleteDocument(req.user.sub, id, req.user.workspaceId);
  }

  // ═══ BANK ═══

  @ApiOperation({ summary: 'Get bank account information for the workspace' })
  @ApiResponse({ status: 200, description: 'Bank account data' })
  @Get('bank')
  async getBankAccount(@Req() req: AuthenticatedRequest) {
    return this.kycService.getBankAccount(req.user.workspaceId);
  }

  /** Update bank account. */
  @ApiOperation({ summary: 'Update bank account information' })
  @ApiResponse({ status: 200, description: 'Bank account updated' })
  @ApiResponse({ status: 400, description: 'Invalid bank data' })
  @ApiBody({ type: UpdateBankDto })
  @Put('bank')
  async updateBankAccount(@Req() req: AuthenticatedRequest, @Body() dto: UpdateBankDto) {
    return this.kycService.updateBankAccount(req.user.workspaceId, dto);
  }

  // ═══ SECURITY ═══

  @ApiOperation({ summary: 'Change the user password' })
  @ApiResponse({ status: 200, description: 'Password changed' })
  @ApiResponse({ status: 400, description: 'Invalid password' })
  @ApiBody({ type: ChangePasswordDto })
  @Post('security/change-password')
  async changePassword(@Req() req: AuthenticatedRequest, @Body() dto: ChangePasswordDto) {
    return this.kycService.changePassword(req.user.sub, dto);
  }

  // ═══ KYC STATUS ═══

  @ApiOperation({ summary: 'Get KYC verification status' })
  @ApiResponse({ status: 200, description: 'KYC status' })
  @Get('status')
  async getStatus(@Req() req: AuthenticatedRequest) {
    return this.kycService.getStatus(req.user.sub);
  }

  /** Get completion. */
  @ApiOperation({ summary: 'Get KYC completion percentage' })
  @ApiResponse({ status: 200, description: 'KYC completion data' })
  @Get('completion')
  async getCompletion(@Req() req: AuthenticatedRequest) {
    return this.kycService.getCompletion(req.user.sub, req.user.workspaceId);
  }

  /** Submit kyc. */
  @ApiOperation({ summary: 'Submit KYC for verification' })
  @ApiResponse({ status: 200, description: 'KYC submitted' })
  @ApiResponse({ status: 400, description: 'Incomplete KYC data' })
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
      ...(ipAddress !== undefined ? { ipAddress } : {}),
      ...(userAgent !== undefined ? { userAgent } : {}),
    });
  }

  // ═══ AUTO-APPROVAL & ADMIN ═══

  @ApiOperation({ summary: 'Auto-check KYC completeness' })
  @ApiResponse({ status: 200, description: 'Auto-check result' })
  @InternalEndpoint('KYC auto-check trigger')
  @Post('auto-check')
  async autoCheck(@Req() req: AuthenticatedRequest) {
    return this.kycService.autoApproveIfComplete(req.user.sub, req.user.workspaceId);
  }

  /** Admin approve. */
  @ApiOperation({ summary: 'Admin approve a KYC submission' })
  @ApiResponse({ status: 200, description: 'KYC approved' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin only' })
  @InternalEndpoint('KYC agent approval')
  @Post(':agentId/approve')
  async adminApprove(@Req() req: AuthenticatedRequest, @Param('agentId') agentId: string) {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can approve KYC');
    }
    return this.kycService.adminApprove(agentId);
  }
}
