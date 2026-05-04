import { mutate } from 'swr';
import { apiFetch } from './core';

interface MemberArea {
  id: string;
  name: string;
  description?: string;
  modules?: MemberAreaModule[];
}

interface MemberAreaModule {
  id: string;
  name: string;
  lessons?: Array<{ id: string; title: string }>;
}

interface MemberAreaStudent {
  id: string;
  name?: string;
  email?: string;
  enrolledAt?: string;
  progress?: number;
}

export const memberAreaApi = {
  list: () => apiFetch<MemberArea[]>('/member-areas'),
  stats: () => apiFetch<{ total: number; active: number; students: number }>('/member-areas/stats'),
  get: (id: string) => apiFetch<MemberArea>(`/member-areas/${id}`),
  create: async (data: Record<string, unknown>) => {
    const res = await apiFetch<MemberArea>('/member-areas', { method: 'POST', body: data });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/member-areas'));
    return res;
  },
  update: async (id: string, data: Record<string, unknown>) => {
    const res = await apiFetch<MemberArea>(`/member-areas/${id}`, { method: 'PUT', body: data });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/member-areas'));
    return res;
  },
  remove: async (id: string) => {
    const res = await apiFetch<{ success: boolean }>(`/member-areas/${id}`, { method: 'DELETE' });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/member-areas'));
    return res;
  },
  createModule: async (areaId: string, data: Record<string, unknown>) => {
    const res = await apiFetch<MemberAreaModule>(`/member-areas/${areaId}/modules`, {
      method: 'POST',
      body: data,
    });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/member-areas'));
    return res;
  },
  createLesson: async (areaId: string, moduleId: string, data: Record<string, unknown>) => {
    const res = await apiFetch<{ id: string; title: string }>(
      `/member-areas/${areaId}/modules/${moduleId}/lessons`,
      {
        method: 'POST',
        body: data,
      },
    );
    mutate((key: string) => typeof key === 'string' && key.startsWith('/member-areas'));
    return res;
  },
  generateStructure: async (areaId: string) => {
    const res = await apiFetch<{ modules: MemberAreaModule[] }>(
      `/member-areas/${areaId}/generate-structure`,
      {
        method: 'POST',
      },
    );
    mutate((key: string) => typeof key === 'string' && key.startsWith('/member-areas'));
    return res;
  },
};

export const memberAreaStudentsApi = {
  list: (areaId: string, q?: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return apiFetch<MemberAreaStudent[]>(
      `/member-areas/${encodeURIComponent(areaId)}/students${qs}`,
    );
  },
  enroll: async (
    areaId: string,
    data: { studentName: string; studentEmail: string; studentPhone?: string },
  ) => {
    const res = await apiFetch<MemberAreaStudent>(
      `/member-areas/${encodeURIComponent(areaId)}/students`,
      { method: 'POST', body: data },
    );
    mutate((key: string) => typeof key === 'string' && key.startsWith('/member-areas'));
    return res;
  },
  remove: async (areaId: string, studentId: string) => {
    const res = await apiFetch<{ success: boolean }>(
      `/member-areas/${encodeURIComponent(areaId)}/students/${encodeURIComponent(studentId)}`,
      { method: 'DELETE' },
    );
    mutate((key: string) => typeof key === 'string' && key.startsWith('/member-areas'));
    return res;
  },
  update: async (areaId: string, studentId: string, data: Record<string, unknown>) => {
    const res = await apiFetch<MemberAreaStudent>(
      `/member-areas/${encodeURIComponent(areaId)}/students/${encodeURIComponent(studentId)}`,
      {
        method: 'PUT',
        body: data,
      },
    );
    mutate((key: string) => typeof key === 'string' && key.startsWith('/member-areas'));
    return res;
  },
  completeLesson: async (
    areaId: string,
    lessonId: string,
    data: { studentEmail: string; completed: boolean },
  ) => {
    const res = await apiFetch<{ progress: number; totalLessons: number; completed: boolean }>(
      `/member-areas/${encodeURIComponent(areaId)}/lessons/${encodeURIComponent(lessonId)}/complete`,
      { method: 'POST', body: data },
    );
    mutate((key: string) => typeof key === 'string' && key.startsWith('/member-areas'));
    return res;
  },
};
