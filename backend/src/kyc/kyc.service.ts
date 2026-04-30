import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { compare as bcryptCompare, hash as bcryptHash } from 'bcrypt';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { BCRYPT_ROUNDS } from '../common/constants';
import { ConnectService } from '../payments/connect/connect.service';
import { StorageService } from '../common/storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { UpdateFiscalDto } from './dto/update-fiscal.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

interface SubmitKycContext {
  ipAddress?: string;
  userAgent?: string;
}

function trimToUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function digitsOnly(value: unknown): string | undefined {
  const raw = trimToUndefined(value);
  if (!raw) {
    return undefined;
  }
  const normalized = raw.replace(/\D/g, '');
  return normalized || undefined;
}

function buildPersonName(name: string | null | undefined): {
  firstName?: string;
  lastName?: string;
} {
  const normalized = trimToUndefined(name);
  if (!normalized) {
    return {};
  }

  const parts = normalized.split(/\s+/);
  const firstName = parts.shift();
  const lastName = parts.join(' ') || undefined;
  return {
    firstName,
    lastName,
  };
}

function buildDateOfBirth(date: Date | null | undefined):
  | {
      day: number;
      month: number;
      year: number;
    }
  | undefined {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return undefined;
  }

  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
}
import "../../../scripts/pulse/__companions__/kyc.service.companion";
