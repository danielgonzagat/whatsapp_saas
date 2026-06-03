import { apiFetch } from './core';

type ObjectionMemoryEnvelope<T> = {
  data?: T | undefined;
  error?: string | undefined;
  status: number;
};

type ObjectionSaveResponse = {
  status?: string | undefined;
  memory?: unknown;
};

interface ObjectionMemory {
  id: string;
  value?: { objection?: string; response?: string };
}

function confirmObjectionEnvelope<T>(
  response: ObjectionMemoryEnvelope<T>,
  fallbackMessage: string,
): ObjectionMemoryEnvelope<T> {
  if (response.error || response.status >= 400) {
    throw new Error(response.error ?? fallbackMessage);
  }
  return response;
}

export async function saveObjectionScript(
  workspaceId: string,
  objection: string,
  response: string,
  _token?: string,
): Promise<{ success: boolean }> {
  const res = await apiFetch<ObjectionSaveResponse>(`/kloel/memory/${workspaceId}/save`, {
    method: 'POST',
    body: {
      key: `objection_${Date.now()}`,
      value: { objection, response },
      category: 'objection_script',
      content: `OBJEÇÃO: ${objection}\nRESPOSTA: ${response}`,
    },
  });
  const confirmed = confirmObjectionEnvelope(res, 'Erro ao salvar roteiro de objecao');
  if (confirmed.data?.status !== 'saved') {
    throw new Error('Objection script save was not confirmed');
  }
  return { success: true };
}

export async function listObjectionScripts(
  workspaceId: string,
  _token?: string,
): Promise<Array<{ id: string; objection: string; response: string }>> {
  const res = await apiFetch<{ memories: ObjectionMemory[] }>(
    `/kloel/memory/${workspaceId}/list?category=objection_script`,
  );
  const confirmed = confirmObjectionEnvelope(res, 'Erro ao listar roteiros de objecao');
  if (!confirmed.data || !Array.isArray(confirmed.data.memories)) {
    throw new Error('Objection script list did not return a confirmed payload');
  }
  return confirmed.data.memories.map((m) => ({
    id: m.id,
    objection: m.value?.objection || '',
    response: m.value?.response || '',
  }));
}
