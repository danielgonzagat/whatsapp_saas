import { apiFetch } from './core';

export async function saveObjectionScript(
  workspaceId: string,
  objection: string,
  response: string,
  _token?: string,
): Promise<{ success: boolean }> {
  const res = await apiFetch<{ success: boolean }>(`/kloel/memory/${workspaceId}/save`, {
    method: 'POST',
    body: {
      key: `objection_${Date.now()}`,
      value: { objection, response },
      type: 'objection_script',
      content: `OBJEÇÃO: ${objection}\nRESPOSTA: ${response}`,
    },
  });
  return { success: !res.error };
}

export async function listObjectionScripts(
  workspaceId: string,
  _token?: string,
): Promise<Array<{ id: string; objection: string; response: string }>> {
  interface ObjectionMemory {
    id: string;
    value?: { objection?: string; response?: string };
  }
  const res = await apiFetch<{ memories: ObjectionMemory[] }>(
    `/kloel/memory/${workspaceId}/list?category=objection_script`,
  );
  if (res.error) {
    return [];
  }
  return (res.data?.memories || []).map((m) => ({
    id: m.id,
    objection: m.value?.objection || '',
    response: m.value?.response || '',
  }));
}
