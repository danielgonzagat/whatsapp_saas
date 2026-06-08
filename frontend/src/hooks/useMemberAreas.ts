'use client';
import { apiFetch } from '@/lib/api';
import { memberAreaStudentsApi } from '@/lib/api/member-area';
import { swrFetcher } from '@/lib/fetcher';
import useSWR, { useSWRConfig } from 'swr';

interface MemberAreaStats {
  totalAreas: number;
  totalStudents: number;
  avgCompletion: number;
  avgRating: number;
}

interface MemberAreasResponse {
  areas?: unknown[];
}

type ListPayload = Record<string, unknown> | unknown[] | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveListPayload(
  payload: ListPayload,
  key: string,
  isLoading: boolean,
  invalidMessage: string,
): { items: unknown[]; payloadError?: Error } {
  if (payload === undefined) {
    return isLoading ? { items: [] } : { items: [], payloadError: new Error(invalidMessage) };
  }

  if (Array.isArray(payload)) {
    return { items: payload };
  }

  if (isRecord(payload) && key in payload && Array.isArray(payload[key])) {
    return { items: payload[key] };
  }

  return { items: [], payloadError: new Error(invalidMessage) };
}

/** Use member areas. */
export function useMemberAreas(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const { data, isLoading, error, mutate } = useSWR<MemberAreasResponse | unknown[]>(
    enabled ? '/member-areas' : null,
    swrFetcher,
  );
  const { items, payloadError } = enabled
    ? resolveListPayload(
        data as ListPayload,
        'areas',
        isLoading,
        'Invalid member areas payload',
      )
    : { items: [], payloadError: undefined };
  return {
    areas: items,
    isLoading: enabled ? isLoading : false,
    error: enabled ? error ?? payloadError : undefined,
    mutate,
  };
}

/** Use member area stats. */
export function useMemberAreaStats() {
  const { data, isLoading, error } = useSWR<MemberAreaStats>('/member-areas/stats', swrFetcher);
  return {
    stats: (data as MemberAreaStats) || {
      totalAreas: 0,
      totalStudents: 0,
      avgCompletion: 0,
      avgRating: 0,
    },
    isLoading,
    error,
  };
}

/* ── Mutations ── */
export function useMemberAreaMutations() {
  const { mutate: globalMutate } = useSWRConfig();
  const invalidate = () =>
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/member-areas'));
  const requireMutationSuccess = <T extends { error?: string }>(res: T, fallback: string): T => {
    if (res.error) {
      throw new Error(res.error || fallback);
    }
    return res;
  };

  // Areas
  const createArea = async (body: Record<string, unknown>) => {
    const res = await apiFetch('/member-areas', { method: 'POST', body });
    requireMutationSuccess(res, 'Erro ao criar area de membros');
    await invalidate();
    return res;
  };
  const updateArea = async (id: string, body: Record<string, unknown>) => {
    const res = await apiFetch(`/member-areas/${id}`, { method: 'PUT', body });
    requireMutationSuccess(res, 'Erro ao atualizar area de membros');
    await invalidate();
    return res;
  };
  const deleteArea = async (id: string) => {
    const res = await apiFetch(`/member-areas/${id}`, { method: 'DELETE' });
    requireMutationSuccess(res, 'Erro ao remover area de membros');
    await invalidate();
    return res;
  };

  // Modules
  const createModule = async (areaId: string, body: Record<string, unknown>) => {
    const res = await apiFetch(`/member-areas/${areaId}/modules`, { method: 'POST', body });
    requireMutationSuccess(res, 'Erro ao criar modulo');
    await invalidate();
    return res;
  };
  const updateModule = async (areaId: string, moduleId: string, body: Record<string, unknown>) => {
    const res = await apiFetch(`/member-areas/${areaId}/modules/${moduleId}`, {
      method: 'PUT',
      body,
    });
    requireMutationSuccess(res, 'Erro ao atualizar modulo');
    await invalidate();
    return res;
  };
  const deleteModule = async (areaId: string, moduleId: string) => {
    const res = await apiFetch(`/member-areas/${areaId}/modules/${moduleId}`, { method: 'DELETE' });
    requireMutationSuccess(res, 'Erro ao remover modulo');
    await invalidate();
    return res;
  };

  // Lessons
  const createLesson = async (areaId: string, moduleId: string, body: Record<string, unknown>) => {
    const res = await apiFetch(`/member-areas/${areaId}/modules/${moduleId}/lessons`, {
      method: 'POST',
      body,
    });
    requireMutationSuccess(res, 'Erro ao criar aula');
    await invalidate();
    return res;
  };
  const updateLesson = async (areaId: string, lessonId: string, body: Record<string, unknown>) => {
    const res = await apiFetch(`/member-areas/${areaId}/lessons/${lessonId}`, {
      method: 'PUT',
      body,
    });
    requireMutationSuccess(res, 'Erro ao atualizar aula');
    await invalidate();
    return res;
  };
  const deleteLesson = async (areaId: string, lessonId: string) => {
    const res = await apiFetch(`/member-areas/${areaId}/lessons/${lessonId}`, { method: 'DELETE' });
    requireMutationSuccess(res, 'Erro ao remover aula');
    await invalidate();
    return res;
  };

  return {
    createArea,
    updateArea,
    deleteArea,
    createModule,
    updateModule,
    deleteModule,
    createLesson,
    updateLesson,
    deleteLesson,
  };
}

/* ── Students ── */
export function useMemberAreaStudents(areaId: string | null, q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  const { data, isLoading, error, mutate } = useSWR<{ students?: unknown[] } | unknown[]>(
    areaId ? `/member-areas/${areaId}/students${qs}` : null,
    swrFetcher,
  );
  const { items, payloadError } = areaId
    ? resolveListPayload(
        data as ListPayload,
        'students',
        isLoading,
        'Invalid member area students payload',
      )
    : { items: [], payloadError: undefined };
  return { students: items, isLoading, error: error ?? payloadError, mutate };
}

/** Use member area student mutations. */
export function useMemberAreaStudentMutations() {
  const updateStudent = async (areaId: string, studentId: string, data: Record<string, unknown>) =>
    memberAreaStudentsApi.update(areaId, studentId, data);

  return { updateStudent };
}
