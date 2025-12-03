import { test, expect } from '@playwright/test';

/**
 * Fluxo com WAIT: dispara, envia resposta inbound e verifica conclusão.
 * Pré-req: backend/worker rodando e DB com flow 'test-wait-flow' contendo um waitNode com palavras-chave "sim".
 */
test('flow with wait resumes on inbound message', async ({ request }) => {
  const flow = {
    nodes: [
      { id: 'n1', type: 'messageNode', data: { text: 'start' } },
      { id: 'n2', type: 'waitNode', data: { expectedKeywords: 'sim', timeoutSeconds: 15, yes: 'n3', no: 'n3' } },
      { id: 'n3', type: 'messageNode', data: { text: 'done' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'true' },
      { id: 'e3', source: 'n2', target: 'n3', sourceHandle: 'false' },
    ],
  };

  // Dispara fluxo runtime (sem depender de DB) — auth é opcional em dev
  const start = await request.post('http://localhost:3001/flows/run', {
    data: {
      flow,
      flowId: 'test-wait-flow',
      user: '5511999999999',
      startNode: 'n1',
    },
  });
  expect(start.ok()).toBeTruthy();
  const { executionId } = await start.json();
  expect(executionId).toBeTruthy();

  // Envia mensagem inbound que casa palavra-chave
  const incoming = await request.post('http://localhost:3001/whatsapp/default/incoming', {
    data: {
      from: '5511999999999',
      message: 'sim',
    },
  });
  expect(incoming.ok()).toBeTruthy();

  // Poll status até completar ou timeout
  let status = 'RUNNING';
  for (let i = 0; i < 10 && status === 'RUNNING'; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await request.get(`http://localhost:3001/flows/execution/${executionId}`);
    const body = await res.json();
    status = body?.status;
  }

  expect(status).toBe('COMPLETED');
});
