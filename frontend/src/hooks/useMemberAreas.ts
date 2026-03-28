'use client';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';

interface MemberAreaStats {
  totalAreas: number;
  totalStudents: number;
  avgCompletion: number;
  avgRating: number;
}

interface MemberAreasResponse {
  areas?: unknown[];
}

export function useMemberAreas() {
  const { data, isLoading, error, mutate } = useSWR('/member-areas', swrFetcher);
  const d = data as MemberAreasResponse | unknown[] | undefined;
  const areas = (d && typeof d === 'object' && 'areas' in d) ? (d.areas || []) : (Array.isArray(d) ? d : []);
  return { areas, isLoading, error, mutate };
}

export function useMemberAreaStats() {
  const { data, isLoading, error } = useSWR<MemberAreaStats>('/member-areas/stats', swrFetcher);
  return {
    stats: (data as MemberAreaStats) || { totalAreas: 0, totalStudents: 0, avgCompletion: 0, avgRating: 0 },
    isLoading,
    error,
  };
}

/* ── Mutations ── */
export function useMemberAreaMutations() {
  // Areas
  const createArea = async (body: Record<string, unknown>) => apiFetch('/member-areas', { method: 'POST', body });
  const updateArea = async (id: string, body: Record<string, unknown>) => apiFetch(`/member-areas/${id}`, { method: 'PUT', body });
  const deleteArea = async (id: string) => apiFetch(`/member-areas/${id}`, { method: 'DELETE' });

  // Modules
  const createModule = async (areaId: string, body: Record<string, unknown>) => apiFetch(`/member-areas/${areaId}/modules`, { method: 'POST', body });
  const updateModule = async (areaId: string, moduleId: string, body: Record<string, unknown>) => apiFetch(`/member-areas/${areaId}/modules/${moduleId}`, { method: 'PUT', body });
  const deleteModule = async (areaId: string, moduleId: string) => apiFetch(`/member-areas/${areaId}/modules/${moduleId}`, { method: 'DELETE' });

  // Lessons
  const createLesson = async (areaId: string, moduleId: string, body: Record<string, unknown>) => apiFetch(`/member-areas/${areaId}/modules/${moduleId}/lessons`, { method: 'POST', body });
  const updateLesson = async (areaId: string, lessonId: string, body: Record<string, unknown>) => apiFetch(`/member-areas/${areaId}/lessons/${lessonId}`, { method: 'PUT', body });
  const deleteLesson = async (areaId: string, lessonId: string) => apiFetch(`/member-areas/${areaId}/lessons/${lessonId}`, { method: 'DELETE' });

  return {
    createArea, updateArea, deleteArea,
    createModule, updateModule, deleteModule,
    createLesson, updateLesson, deleteLesson,
  };
}
