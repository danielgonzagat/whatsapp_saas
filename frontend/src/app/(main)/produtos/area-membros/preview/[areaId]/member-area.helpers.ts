import type { Lesson, Module, MemberArea } from './member-area.types';

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function normalizeLesson(raw: unknown, moduleIndex: number, lessonIndex: number): Lesson {
  const lesson = readRecord(raw);
  const fallbackId = `lesson-${moduleIndex}-${lessonIndex}`;
  const desc = optionalString(lesson?.description);
  const vidUrl = optionalString(lesson?.videoUrl);
  return {
    id: readString(lesson?.id) || readString(lesson?._id) || fallbackId,
    name: readString(lesson?.name, `Aula ${lessonIndex + 1}`),
    ...(desc !== undefined ? { description: desc } : {}),
    ...(vidUrl !== undefined ? { videoUrl: vidUrl } : {}),
    position: Number(lesson?.position ?? lessonIndex) || lessonIndex,
  };
}

function normalizeModule(raw: unknown, moduleIndex: number): Module {
  const moduleRecord = readRecord(raw);
  const rawLessons = Array.isArray(moduleRecord?.lessons) ? moduleRecord.lessons : [];
  const fallbackId = `module-${moduleIndex}`;
  const modDesc = optionalString(moduleRecord?.description);
  return {
    id: readString(moduleRecord?.id) || readString(moduleRecord?._id) || fallbackId,
    name: readString(moduleRecord?.name, `Modulo ${moduleIndex + 1}`),
    ...(modDesc !== undefined ? { description: modDesc } : {}),
    position: Number(moduleRecord?.position ?? moduleIndex) || moduleIndex,
    lessons: rawLessons.map((lessonValue, lessonIndex) =>
      normalizeLesson(lessonValue, moduleIndex, lessonIndex),
    ),
  };
}

function pickRawModules(raw: Record<string, unknown>): unknown[] {
  if (Array.isArray(raw.modules)) {
    return raw.modules;
  }
  if (Array.isArray(raw.modulesList)) {
    return raw.modulesList;
  }
  return [];
}

export function normalizeMemberAreaPayload(payload: unknown): MemberArea | null {
  const payloadRecord = readRecord(payload);
  const raw = readRecord(payloadRecord?.area) ?? payloadRecord;
  if (!raw) {
    return null;
  }

  const areaDesc = optionalString(raw.description);
  const areaLogo = optionalString(raw.logoUrl);
  const areaColor = optionalString(raw.primaryColor);
  return {
    id: readString(raw.id),
    name: readString(raw.name, 'Area de membros'),
    ...(areaDesc !== undefined ? { description: areaDesc } : {}),
    ...(areaLogo !== undefined ? { logoUrl: areaLogo } : {}),
    ...(areaColor !== undefined ? { primaryColor: areaColor } : {}),
    modules: pickRawModules(raw).map(normalizeModule),
  };
}
