import { test, expect } from '@playwright/test';

test.describe('Critical Flow: Login -> Create Flow -> Execute', () => {
  test('should login, create a flow, and execute it', async ({ page }) => {
    // 1. Login
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'admin@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Verify dashboard load
    await expect(page).toHaveURL('http://localhost:3000/dashboard');
    await expect(page.locator('text=Dashboard')).toBeVisible();

    // 2. Create Flow
    await page.click('a[href="/flows"]');
    await page.click('button:has-text("Novo Fluxo")');
    
    const flowName = `Flow Test ${Date.now()}`;
    await page.fill('input[placeholder="Nome do fluxo"]', flowName);
    await page.click('button:has-text("Criar")');
    
    // Verify builder load
    await expect(page.locator('.react-flow')).toBeVisible();

    // 3. Add Nodes (Simulated by checking if default node exists)
    await expect(page.locator('text=Start')).toBeVisible();

    // 4. Execute Flow
    await page.click('button:has-text("Executar")');
    
    // Fill execution modal
    await page.fill('input[placeholder="Telefone (ex: 5511999999999)"]', '5511999999999');
    await page.click('button:has-text("Iniciar Execução")');

    // 5. Verify Logs
    // Wait for the console to appear and show logs
    await expect(page.locator('.execution-console')).toBeVisible();
    await expect(page.locator('text=Execução iniciada')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Node Start processado')).toBeVisible();
  });
});
