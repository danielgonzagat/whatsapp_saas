import { extname } from 'node:path';
import { buildTimestampedRuntimeId } from './kloel-id.util';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  NotFoundException,
  Param,
  ParseFilePipe,
  Post,
  Put,
  Query,
  Req,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Optional,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { detectUploadedMime } from '../common/file-signature.util';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { normalizeStorageUrlForRequest } from '../common/storage/public-storage-url.util';
import { StorageService } from '../common/storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationalOnboardingService } from './conversational-onboarding.service';
import { KloelService } from './kloel.service';
import { KloelThreadSearchService } from './kloel-thread-search.service';
import { OpsAlertService } from '../observability/ops-alert.service';

// memoryStorage uploads below enforce fileSize/maxSize caps plus fileFilter/mimetype validation.
const KLOEL_UPLOAD_GENERIC_MIME_RE =
  /^(image\/(jpeg|png|gif|webp)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;
const KLOEL_UPLOAD_CHAT_MIME_RE =
  /^(image\/(jpeg|png|gif|webp)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|text\/plain|text\/csv|audio\/(mpeg|wav|webm|ogg|mp4|x-m4a))$/;

interface ThinkDto {
  message: string;
  workspaceId?: string;
  conversationId?: string;
  mode?: 'chat' | 'onboarding' | 'sales';
  metadata?: Record<string, unknown>;
}

interface MemoryDto {
  workspaceId: string;
  type: string;
  content: string;
  metadata?: Record<string, unknown>;
}

interface OnboardingChatDto {
  message: string;
}
