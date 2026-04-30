import { Test, TestingModule } from '@nestjs/testing';
import { PartnershipsService } from './partnerships.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../auth/email.service';
