import * as crypto from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

const ACCESS_TTL_SECONDS = 60 * 60 * 24 * 7;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AccessTokenPayload = {
  areaId: string;
  enrollmentId: string;
  email: string;
  exp: number;
};

type RequestAccessDto = {
  email?: string;
};

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('email_required');
  }
  const email = value.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new BadRequestException('invalid_email');
  }
  return email;
}

function base64urlJson(value: AccessTokenPayload): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function readJsonPayload(value: string): AccessTokenPayload {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as AccessTokenPayload;
  } catch {
    throw new ForbiddenException('invalid_access_token');
  }
}

@Public()
@Controller('member-areas/public')
export class MemberAreaPublicController {
  constructor(private readonly prisma: PrismaService) {}

  private signingSecret() {
    const secret =
      process.env.MEMBER_AREA_ACCESS_SECRET ||
      process.env.JWT_SECRET ||
      process.env.SESSION_SECRET ||
      '';
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('member_area_access_secret_not_configured');
    }
    return secret || 'local-member-area-access-secret';
  }

  private sign(payload: AccessTokenPayload) {
    const body = base64urlJson(payload);
    const signature = crypto
      .createHmac('sha256', this.signingSecret())
      .update(body)
      .digest('base64url');
    return `${body}.${signature}`;
  }

  private verify(token: string): AccessTokenPayload {
    const [body, signature] = token.split('.');
    if (!body || !signature) {
      throw new ForbiddenException('invalid_access_token');
    }
    const expected = crypto
      .createHmac('sha256', this.signingSecret())
      .update(body)
      .digest('base64url');
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    if (
      expectedBuffer.length !== signatureBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
    ) {
      throw new ForbiddenException('invalid_access_token');
    }
    const payload = readJsonPayload(body);
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new ForbiddenException('expired_access_token');
    }
    return payload;
  }

  @Get(':slug')
  async getPublicArea(@Param('slug') slug: string) {
    const area = await this.prisma.memberArea.findFirst({
      where: { slug, active: true, workspaceId: { not: '' } },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        coverUrl: true,
        logoUrl: true,
        primaryColor: true,
        totalModules: true,
        totalLessons: true,
      },
    });
    if (!area) {
      throw new NotFoundException('member_area_not_found');
    }
    return { area };
  }

  @Post(':slug/access')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async requestAccess(@Param('slug') slug: string, @Body() dto: RequestAccessDto) {
    const email = normalizeEmail(dto.email);
    const enrollment = await this.prisma.memberEnrollment.findFirst({
      where: {
        studentEmail: { equals: email, mode: 'insensitive' },
        status: 'active',
        workspaceId: { not: '' },
        memberArea: { slug, active: true },
      },
      select: {
        id: true,
        studentEmail: true,
        memberAreaId: true,
        memberArea: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
    if (!enrollment) {
      throw new NotFoundException('enrollment_not_found');
    }
    const token = this.sign({
      areaId: enrollment.memberAreaId,
      enrollmentId: enrollment.id,
      email: enrollment.studentEmail.toLowerCase(),
      exp: Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS,
    });
    return { token, area: enrollment.memberArea };
  }

  @Get(':slug/content')
  async getContent(@Param('slug') slug: string, @Query('token') token?: string) {
    if (!token) {
      throw new ForbiddenException('missing_access_token');
    }
    const payload = this.verify(token);
    const enrollment = await this.prisma.memberEnrollment.findFirst({
      where: {
        id: payload.enrollmentId,
        workspaceId: { not: '' },
        memberAreaId: payload.areaId,
        studentEmail: { equals: payload.email, mode: 'insensitive' },
        status: 'active',
        memberArea: { slug, active: true },
      },
      select: {
        id: true,
        studentName: true,
        progress: true,
        memberArea: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            coverUrl: true,
            logoUrl: true,
            primaryColor: true,
            modules: {
              where: { active: true },
              orderBy: { position: 'asc' },
              select: {
                id: true,
                name: true,
                description: true,
                position: true,
                lessons: {
                  where: { active: true },
                  orderBy: { position: 'asc' },
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    type: true,
                    position: true,
                    videoUrl: true,
                    textContent: true,
                    downloadUrl: true,
                    durationMin: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!enrollment) {
      throw new ForbiddenException('access_not_allowed');
    }
    return {
      enrollment: {
        id: enrollment.id,
        studentName: enrollment.studentName,
        progress: enrollment.progress,
      },
      area: enrollment.memberArea,
    };
  }
}
