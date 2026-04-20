'use client';
import { apiFetch } from '@/lib/api';
import { memberAreaStudentsApi } from '@/lib/api/misc';
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

/** Use member areas. */
export function useMemberAreas() {
  const { data, isLoading, error, mutate } = useSWR('/member-areas', swrFetcher);
  const d = data as MemberAreasResponse | unknown[] | undefined;
  const areas =
    d && typeof d === 'object' && 'areas' in d ? d.areas || [] : Array.isArray(d) ? d : [];
  return { areas, isLoading, error, mutate };
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

  // Areas
  const createArea = async (body: Record<string, unknown>) => {
    const res = await apiFetch('/member-areas', { method: 'POST', body });
    await invalidate();
    return res;
  };
  const updateArea = async (id: string, body: Record<string, unknown>) => {
    const res = await apiFetch(`/member-areas/${id}`, { method: 'PUT', body });
    await invalidate();
    return res;
  };
  const deleteArea = async (id: string) => {
    const res = await apiFetch(`/member-areas/${id}`, { method: 'DELETE' });
    await invalidate();
    return res;
  };

  // Modules
  const createModule = async (areaId: string, body: Record<string, unknown>) => {
    const res = await apiFetch(`/member-areas/${areaId}/modules`, { method: 'POST', body });
    await invalidate();
    return res;
  };
  const updateModule = async (areaId: string, moduleId: string, body: Record<string, unknown>) => {
    const res = await apiFetch(`/member-areas/${areaId}/modules/${moduleId}`, {
      method: 'PUT',
      body,
    });
    await invalidate();
    return res;
  };
  const deleteModule = async (areaId: string, moduleId: string) => {
    const res = await apiFetch(`/member-areas/${areaId}/modules/${moduleId}`, { method: 'DELETE' });
    await invalidate();
    return res;
  };

  // Lessons
  const createLesson = async (areaId: string, moduleId: string, body: Record<string, unknown>) => {
    const res = await apiFetch(`/member-areas/${areaId}/modules/${moduleId}/lessons`, {
      method: 'POST',
      body,
    });
    await invalidate();
    return res;
  };
  const updateLesson = async (areaId: string, lessonId: string, body: Record<string, unknown>) => {
    const res = await apiFetch(`/member-areas/${areaId}/lessons/${lessonId}`, {
      method: 'PUT',
      body,
    });
    await invalidate();
    return res;
  };
  const deleteLesson = async (areaId: string, lessonId: string) => {
    const res = await apiFetch(`/member-areas/${areaId}/lessons/${lessonId}`, { method: 'DELETE' });
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
  const { data, isLoading, error, mutate } = useSWR(
    areaId ? `/member-areas/${areaId}/students${qs}` : null,
    swrFetcher,
  );
  const students = Array.isArray(data)
    ? data
    : ((data as { students?: unknown[] } | undefined)?.students ?? []);
  return { students, isLoading, error, mutate };
}

/** Use member area student mutations. */
export function useMemberAreaStudentMutations() {
  const updateStudent = async (areaId: string, studentId: string, data: Record<string, unknown>) =>
    memberAreaStudentsApi.update(areaId, studentId, data);

  return { updateStudent };
}
