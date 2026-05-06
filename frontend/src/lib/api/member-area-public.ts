import { apiUrl } from '../http';

export type PublicMemberLesson = {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  position: number;
  videoUrl?: string | null;
  textContent?: string | null;
  downloadUrl?: string | null;
  durationMin?: number | null;
};

export type PublicMemberModule = {
  id: string;
  name: string;
  description?: string | null;
  position: number;
  lessons: PublicMemberLesson[];
};

export type PublicMemberArea = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  coverUrl?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  totalModules?: number;
  totalLessons?: number;
  modules?: PublicMemberModule[];
};

export type PublicMemberContent = {
  enrollment: {
    id: string;
    studentName: string;
    progress: number;
  };
  area: PublicMemberArea & {
    modules: PublicMemberModule[];
  };
};

export async function fetchPublicMemberArea(slug: string) {
  const response = await fetch(apiUrl(`/member-areas/public/${encodeURIComponent(slug)}`), {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error('member_area_not_found');
  }
  return (await response.json()) as { area: PublicMemberArea };
}

export async function requestPublicMemberAreaAccess(slug: string, email: string) {
  const response = await fetch(apiUrl(`/member-areas/public/${encodeURIComponent(slug)}/access`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    throw new Error(response.status === 404 ? 'enrollment_not_found' : 'access_request_failed');
  }
  return (await response.json()) as { token: string; area: PublicMemberArea };
}

export async function fetchPublicMemberAreaContent(slug: string, token: string) {
  const url = apiUrl(
    `/member-areas/public/${encodeURIComponent(slug)}/content?token=${encodeURIComponent(token)}`,
  );
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('content_access_denied');
  }
  return (await response.json()) as PublicMemberContent;
}
