import { test, expect } from '@playwright/test';

test.describe('Flow Execution E2E', () => {
  test('should create a flow, execute it, and handle inbound response', async ({ request, page }) => {
    // 1. Login
    // Assuming we have a login helper or we do it manually
    // For API tests, we might just get a token
    
    // Mock Data
    const flowName = `E2E Flow ${Date.now()}`;
    const workspaceId = 'default'; // Replace with real ID if needed
    
    // 2. Create Flow via API
    const createRes = await request.post('http://localhost:3001/flows', {
      data: {
        name: flowName,
        workspaceId,
        nodes: [
          { id: '1', type: 'start', data: { label: 'Start' }, position: { x: 0, y: 0 } },
          { id: '2', type: 'messageNode', data: { text: 'Hello {{contact_name}}' }, position: { x: 100, y: 0 } },
          { id: '3', type: 'waitNode', data: { timeout: 60, expectedKeywords: 'yes,sim' }, position: { x: 200, y: 0 } },
          { id: '4', type: 'messageNode', data: { text: 'You said YES!' }, position: { x: 300, y: 0 } },
          { id: '5', type: 'messageNode', data: { text: 'You said NO...' }, position: { x: 300, y: 100 } }
        ],
        edges: [
          { id: 'e1-2', source: '1', target: '2' },
          { id: 'e2-3', source: '2', target: '3' },
          { id: 'e3-4', source: '3', target: '4', sourceHandle: 'yes' },
          { id: 'e3-5', source: '3', target: '5', sourceHandle: 'no' }
        ]
      }
    });
    expect(createRes.ok()).toBeTruthy();
    const flow = await createRes.json();
    console.log('Flow created:', flow.id);

    // 3. Execute Flow
    const runRes = await request.post(`http://localhost:3001/flows/${flow.id}/run`, {
      data: {
        user: '5511999999999',
        initialVars: { contact_name: 'Tester' }
      }
    });
    expect(runRes.ok()).toBeTruthy();
    const runData = await runRes.json();
    const executionId = runData.executionId;
    console.log('Execution started:', executionId);

    // 4. Poll for Execution Status (WAITING_INPUT)
    // We need an endpoint to get execution status. Assuming GET /flows/execution/:id
    let status = '';
    for (let i = 0; i < 10; i++) {
      const statusRes = await request.get(`http://localhost:3001/flows/execution/${executionId}`);
      const statusData = await statusRes.json();
      status = statusData.status;
      if (status === 'WAITING_INPUT') break;
      await page.waitForTimeout(1000);
    }
    expect(status).toBe('WAITING_INPUT');
    console.log('Flow is waiting for input...');

    // 5. Simulate Inbound Message (Webhook)
    const webhookRes = await request.post('http://localhost:3001/whatsapp/webhook', {
      data: {
        workspaceId,
        from: '5511999999999',
        message: 'Sim, eu quero!'
      }
    });
    expect(webhookRes.ok()).toBeTruthy();
    console.log('Inbound message sent.');

    // 6. Poll for Completion
    for (let i = 0; i < 10; i++) {
      const statusRes = await request.get(`http://localhost:3001/flows/execution/${executionId}`);
      const statusData = await statusRes.json();
      status = statusData.status;
      if (status === 'COMPLETED') break;
      await page.waitForTimeout(1000);
    }
    expect(status).toBe('COMPLETED');
    console.log('Flow completed successfully.');

    // 7. Verify Logs
    const logsRes = await request.get(`http://localhost:3001/flows/execution/${executionId}`);
    const logsData = await logsRes.json();
    const logs = logsData.logs;
    
    // Check if "You said YES!" node was executed
    const yesNode = logs.find((l: any) => l.nodeId === '4' && l.event === 'node_start');
    expect(yesNode).toBeDefined();
  });
});
