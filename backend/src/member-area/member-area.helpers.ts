import { Prisma } from '@prisma/client';
import { AuthenticatedRequest } from '../common/interfaces';
import { normalizeStorageUrlForRequest } from '../common/storage/public-storage-url.util';

export const U0300__U036F_RE = /[\u0300-\u036f]/g;
export const A_Z0_9_RE = /[^a-z0-9]+/g;
export const PATTERN_RE = /^-|-$/g;

export interface CreateMemberAreaDto {
  name: string;
  slug?: string;
  description?: string;
  type?: string;
  template?: string;
  logoUrl?: string;
  coverUrl?: string;
  primaryColor?: string;
  customDomain?: string;
  productId?: string;
  certificates?: boolean;
  quizzes?: boolean;
  community?: boolean;
  gamification?: boolean;
  progressTrack?: boolean;
  downloads?: boolean;
  comments?: boolean;
}

export interface UpdateMemberAreaDto extends Partial<CreateMemberAreaDto> {
  active?: boolean;
}

export interface CreateModuleDto {
  name: string;
  description?: string;
  position?: number;
  releaseType?: string;
  releaseDate?: string;
  releaseDays?: number;
}

export interface CreateLessonDto {
  name: string;
  description?: string;
  type?: string;
  position?: number;
  videoUrl?: string;
  textContent?: string;
  downloadUrl?: string;
  quizData?: Prisma.InputJsonValue;
  durationMin?: number;
}

export interface UpdateLessonDto {
  name?: string;
  description?: string;
  videoUrl?: string;
  textContent?: string;
  downloadUrl?: string;
  position?: number;
  type?: string;
  durationMin?: number;
  active?: boolean;
}

export interface EnrollStudentDto {
  studentName?: string;
  studentEmail?: string;
  studentPhone?: string;
  name?: string;
  email?: string;
  phone?: string;
}

export function readText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function serializeArea(
  req: AuthenticatedRequest,
  area: Record<string, unknown> | null | undefined,
) {
  if (!area) {
    return area;
  }

  const modules = Array.isArray(area.modules) ? area.modules : [];
  const lessonsCount =
    area.totalLessons ??
    modules.reduce(
      (sum: number, module: { lessons?: unknown[] }) =>
        sum + (Array.isArray(module.lessons) ? module.lessons.length : 0),
      0,
    );

  return {
    ...area,
    logoUrl: normalizeStorageUrlForRequest(area.logoUrl as string, req) || null,
    coverUrl: normalizeStorageUrlForRequest(area.coverUrl as string, req) || null,
    studentsCount: area.totalStudents ?? 0,
    modulesCount: area.totalModules ?? modules.length,
    lessonsCount,
    modulesList: modules,
  };
}
